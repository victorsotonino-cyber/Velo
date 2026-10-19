const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const config = require("./config");
const sharp = require("sharp");

const API_URL = "https://emoji.gg/api";
const MAX_PACK_SIZE = 120;
const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;
const CATALOG_TIMEOUT_MS = 15000;
const DOWNLOAD_TIMEOUT_MS = 7000;
const DOWNLOAD_WORKERS = 6;
const UPLOAD_WORKERS = 1;

let catalogCache = null;
let catalogCacheUntil = 0;
let catalogRequest = null;
const activeGuilds = new Set();

const RULES = {
  staff: /staff|moderator|moderation|admin|administrator|owner|helper|trial|management|developer|coder|designer|support|security|police|ban|mute|warn|kick|role.?icon|modrole|headadmin|guardian|team|manager/i,
  owner: /owner|crown|founder|chief|director|head.?admin|administrator|boss|leader/i,
  tickets: /ticket|claim|support|help.?desk|mail|closed|inbox|report|customer|service|case|request/i,
  tienda: /shop|store|cart|shopping|sellix|stripe|paypal|shopee|money|cash|bank|card|coin|crypto|payment|pay|sale|gift|discount|order|delivery|stock|premium|purchase|buy|deal|coupon|wallet|bitcoin|ethereum|litecoin|billing|checkout|trolley/i,
  pagos: /paypal|stripe|visa|mastercard|payment|pay|bank|money|cash|coin|crypto|wallet|card|bitcoin|ethereum|litecoin|invoice|receipt|billing|checkout|gcash|paysafecard/i,
  verificados: /verified|verify|check.?mark|tick|badge|confirm|success|approved|green.?check|blue.?check|blue.?tick/i,
  gaming: /minecraft|roblox|fortnite|valorant|gaming|gamer|controller|creeper|nether|ender|pickaxe|sword|fps|pvp|trophy|rank|xbox|playstation|nintendo|gta|mm2|gamepad|steam|diamond/i,
  comunidad: /partner|community|welcome|wave|blob|pepe|cat|cute|star|spark|hype|smile|laugh|cry|fire|thumb|dance|party|happy|angry|sus|meme|hello|hug|clap|celebrate|wow|bruh|cool|heart|love|friend|cheer|lol|lmao|good|bad/i
};

const BLOCKED = /nsfw|porn|hentai|nude|naked|adult|lewd|explicit|boob|titty|dick|cock|pussy|cum|penis|vagina|onlyfans|erotic|fetish|rape|gore|self.?harm/i;

const PACK_LABELS = {
  staff: "Staff y moderación",
  owner: "Owner y administración",
  tickets: "Tickets y soporte",
  tienda: "Tienda y compras",
  pagos: "Pagos",
  verificados: "Verificados",
  gaming: "Gaming y Minecraft",
  comunidad: "Comunidad y memes",
  animados: "Solo animados",
  todo: "Pack Flux STORE • 120 emojis"
};

function normaliseName(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function makeEmojiName(entry) {
  const title = normaliseName(entry.title || entry.slug || "custom").slice(0, 18) || "custom";
  const rawId = String(entry.id ?? (String(entry.slug || "").match(/^\d+/) || ["0"])[0]);
  const id = rawId.replace(/\D/g, "").slice(-6) || "0";
  return ("flux_" + title + "_" + id).slice(0, 32);
}


function unpackCatalog(body) {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== "object") return [];
  for (const key of ["emojis", "items", "data", "results", "entries"]) {
    if (Array.isArray(body[key])) return body[key];
    if (body[key] && typeof body[key] === "object") {
      for (const nested of ["emojis", "items", "results", "entries"]) {
        if (Array.isArray(body[key][nested])) return body[key][nested];
      }
    }
  }
  return [];
}

function extraFeedUrls() {
  const configured = String(process.env.EMOJI_EXTRA_API_URLS || "")
    .split(",").map(value => value.trim()).filter(Boolean);
  // Legacy public emoji catalog: use only its JSON API, never scrape HTML pages.
  return [...new Set(["https://discordemoji.com/api/", ...configured])].slice(0, 8);
}

function extraImageHosts() {
  return String(process.env.EMOJI_EXTRA_IMAGE_HOSTS || "")
    .split(",").map(value => value.trim().toLowerCase()).filter(Boolean);
}

async function loadCatalog() {
  if (catalogCache && Date.now() < catalogCacheUntil) return catalogCache;
  if (catalogRequest) return catalogRequest;

  catalogRequest = (async () => {
    const sources = [{ url: API_URL, official: true }, ...extraFeedUrls().map(url => ({ url, official: false }))];
    const configuredImageHosts = extraImageHosts();
    const results = await Promise.allSettled(sources.map(async source => {
      let sourceUrl;
      try { sourceUrl = new URL(source.url); } catch { throw new Error("URL de catálogo inválida"); }
      if (sourceUrl.protocol !== "https:") throw new Error("Los catálogos adicionales deben usar HTTPS");
      const response = await fetch(source.url, {
        signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; FluxSTORE-EmojiInstaller/3.3; +https://emoji.gg/)",
          "Accept": "application/json",
          "Referer": "https://emoji.gg/"
        }
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const body = await response.json();
      const items = unpackCatalog(body);
      if (!items.length) throw new Error("el catálogo no contiene una lista de emojis");

      const normalized = [];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const imageValue = item.image || item.image_url || item.imageUrl || item.gif_url || item.gif || item.url;
        const title = item.title || item.name || item.slug || item.id;
        if (!imageValue || !title) continue;
        let parsed;
        try { parsed = new URL(String(imageValue), sourceUrl); } catch { continue; }
        if (parsed.protocol !== "https:") continue;
        const emojiHosts = ["emoji.gg", "www.emoji.gg", "cdn3.emoji.gg", "discordemoji.com", "www.discordemoji.com"];
        if (source.official) {
          if (!emojiHosts.includes(parsed.hostname.toLowerCase())) continue;
        } else if (parsed.hostname.toLowerCase() !== sourceUrl.hostname.toLowerCase() &&
                   !configuredImageHosts.includes(parsed.hostname.toLowerCase()) &&
                   !emojiHosts.includes(parsed.hostname.toLowerCase())) {
          continue;
        }
        if (!/\.(png|gif|webp|jpe?g|svg|avif)$/i.test(parsed.pathname)) continue;
        const searchable = (String(title) + " " + String(item.slug || "") + " " +
          String(item.description || "") + " " + String(item.tags || "")).toLowerCase();
        if (BLOCKED.test(searchable)) continue;
        const providerId = source.official ? "emoji_gg" : sourceUrl.hostname.replace(/[^a-z0-9]/gi, "_").slice(0, 12);
        const rawId = String(item.id ?? item.slug ?? title);
        const entry = {
          id: providerId + "_" + rawId,
          title: String(title),
          slug: String(item.slug || title),
          url: parsed.href,
          faves: Number(item.faves || item.favorites || item.likes) || 0,
          searchable,
          source: source.official ? "Emoji.gg" : sourceUrl.hostname
        };
        entry.name = makeEmojiName(entry);
        normalized.push(entry);
      }
      return normalized;
    }));

    const seenNames = new Set();
    const seenUrls = new Set();
    const entries = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status !== "fulfilled") {
        console.warn("[Emoji pack] Fuente omitida:", sources[i].url, String(result.reason?.message || result.reason));
        continue;
      }
      for (const entry of result.value) {
        const urlKey = new URL(entry.url).href;
        if (seenNames.has(entry.name) || seenUrls.has(urlKey)) continue;
        seenNames.add(entry.name);
        seenUrls.add(urlKey);
        entries.push(entry);
      }
    }

    if (!entries.length) throw new Error("ninguna fuente devolvió imágenes compatibles; revisa Emoji.gg y EMOJI_EXTRA_API_URLS");
    catalogCache = entries;
    catalogCacheUntil = Date.now() + 15 * 60 * 1000;
    return entries;
  })();

  try {
    return await catalogRequest;
  } finally {
    catalogRequest = null;
  }
}
function pickItems(entries, selected, existingNames) {
  // Prefer independent catalog providers before Emoji.gg: some hosting IPs (including
  // bot hosts) may receive HTTP 403 from Emoji.gg's image CDN.
  const sorted = entries.slice().sort((a, b) => {
    const aBlockedHost = /^emoji\.gg$/i.test(new URL(a.url).hostname.replace(/^www\./i, "")) ||
      /^cdn3\.emoji\.gg$/i.test(new URL(a.url).hostname);
    const bBlockedHost = /^emoji\.gg$/i.test(new URL(b.url).hostname.replace(/^www\./i, "")) ||
      /^cdn3\.emoji\.gg$/i.test(new URL(b.url).hostname);
    if (aBlockedHost !== bBlockedHost) return aBlockedHost ? 1 : -1;
    return b.faves - a.faves;
  });
  const available = sorted.filter(item => !existingNames.has(item.name));
  const requestedTarget = selected === "todo" ? MAX_PACK_SIZE : (selected === "animados" ? 30 : 25);
  const target = Math.min(requestedTarget, available.length);
  const picked = [];
  const pickedIds = new Set();

  const addMatches = (pattern, quota) => {
    let remaining = quota;
    for (const item of available) {
      if (picked.length >= target || pickedIds.has(item.id)) continue;
      if (!pattern.test(item.searchable)) continue;
      picked.push(item);
      pickedIds.add(item.id);
      remaining--;
      if (remaining <= 0) break;
    }
  };

  if (selected === "todo") {
    addMatches(RULES.staff, 20);
    addMatches(RULES.owner, 10);
    addMatches(RULES.tickets, 20);
    addMatches(RULES.tienda, 18);
    addMatches(RULES.pagos, 14);
    addMatches(RULES.verificados, 14);
    addMatches(RULES.gaming, 12);
    addMatches(RULES.comunidad, 12);
  } else if (selected === "animados") {
    for (const item of available) {
      if (picked.length >= target) break;
      if (/\.gif$/i.test(item.url)) {
        picked.push(item);
        pickedIds.add(item.id);
      }
    }
  } else {
    addMatches(RULES[selected], target);
  }

  const broadSafe = /emoji|icon|role|admin|staff|owner|mod|helper|ticket|support|shop|cart|pay|money|verified|check|game|craft|partner|heart|cute|smile|blob|pepe|meme|cat|star|fire|gift|sale|discord|server|developer|coder|designer|bot|premium|blue|purple|pink|red|green/i;
  if (picked.length < target) {
    for (const item of available) {
      if (picked.length >= target || pickedIds.has(item.id)) continue;
      if (selected === "animados" && !/\.gif$/i.test(item.url)) continue;
      if (selected === "todo" && !broadSafe.test(item.searchable)) continue;
      if (selected !== "todo" && selected !== "animados" && !RULES[selected].test(item.searchable)) continue;
      picked.push(item);
      pickedIds.add(item.id);
    }
  }

  return { items: picked, target: requestedTarget, available: available.length };
}


async function downloadEmoji(url) {
  const allowedHosts = new Set([
    "emoji.gg", "www.emoji.gg", "cdn3.emoji.gg",
    "discordemoji.com", "www.discordemoji.com",
    ...extraImageHosts()
  ].map(host => host.toLowerCase()));
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error("enlace de imagen inválido"); }
  if (parsed.protocol !== "https:" || !allowedHosts.has(parsed.hostname.toLowerCase())) {
    throw new Error("el enlace no pertenece a una fuente HTTPS permitida");
  }

  const candidates = [parsed.href];
  const filename = parsed.pathname.split("/").pop();
  const isEmojiGG = ["cdn3.emoji.gg", "emoji.gg", "www.emoji.gg"].includes(parsed.hostname.toLowerCase());
  if (isEmojiGG && filename && /\.(png|gif|webp|jpe?g|svg|avif)$/i.test(filename)) {
    candidates.push("https://emoji.gg/assets/emoji/" + encodeURIComponent(filename));
    candidates.push("https://cdn3.emoji.gg/assets/emoji/" + encodeURIComponent(filename));
  }

  let input = null;
  let validMetadata = null;
  let lastError = "la fuente no respondió";
  for (const candidate of [...new Set(candidates)]) {
    let candidateUrl;
    try { candidateUrl = new URL(candidate); } catch { continue; }
    if (candidateUrl.protocol !== "https:" || !allowedHosts.has(candidateUrl.hostname.toLowerCase())) continue;

    try {
      const response = await fetch(candidate, {
        redirect: "follow",
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; FluxSTORE-EmojiInstaller/3.7; +https://emoji.gg/)",
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Referer": "https://emoji.gg/"
        }
      });
      if (!response.ok) {
        lastError = "HTTP " + response.status;
        continue;
      }
      const finalUrl = new URL(response.url);
      if (finalUrl.protocol !== "https:" || !allowedHosts.has(finalUrl.hostname.toLowerCase())) {
        lastError = "redirección a un dominio no permitido";
        continue;
      }
      const contentType = String(response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > MAX_DOWNLOAD_BYTES) {
        lastError = "imagen original mayor de 8 MB";
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.length) {
        lastError = "imagen vacía";
        continue;
      }
      if (buffer.length > MAX_DOWNLOAD_BYTES) {
        lastError = "imagen original mayor de 8 MB";
        continue;
      }

      let metadata;
      try { metadata = await sharp(buffer, { animated: true, limitInputPixels: 16777216 }).metadata(); }
      catch {
        lastError = "respuesta no válida (" + (contentType || "no es imagen") + ")";
        continue;
      }
      if (!["png", "gif", "webp", "jpeg", "svg", "avif"].includes(metadata.format)) {
        lastError = "formato no compatible: " + String(metadata.format || contentType || "desconocido");
        continue;
      }
      input = buffer;
      validMetadata = metadata;
      break;
    } catch (error) {
      lastError = safeError(error);
    }
  }

  if (!input || !validMetadata) {
    throw new Error("ningún enlace devolvió una imagen válida (" + lastError + ")");
  }

  const animated = validMetadata.format === "gif" || Boolean(validMetadata.pages && validMetadata.pages > 1);
  for (const size of [128, 96, 64, 48]) {
    try {
      const image = sharp(input, { animated, limitInputPixels: 16777216 })
        .resize(size, size, { fit: "inside", withoutEnlargement: true });
      const output = animated
        ? await image.gif({ quality: 78, effort: 10, dither: 0.7 }).toBuffer()
        : await image.png({ palette: true, quality: 82, effort: 10, compressionLevel: 9 }).toBuffer();
      if (output.length <= 256 * 1024) return output;
    } catch (error) {
      if (size === 48) throw new Error("no se pudo procesar la imagen: " + safeError(error));
    }
  }
  throw new Error("no se pudo comprimir por debajo de 256 KB");
}
async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(label + " (" + Math.round(ms / 1000) + " s)")), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function safeError(error) {
  const message = String(error?.message || error || "error desconocido");
  if (isDiscordRateLimitError(error)) return "límite temporal de Discord";
  if (/timed out|timeout|abort|ECONNRESET|UND_ERR/i.test(message)) return "tiempo de espera agotado";
  return message.replace(/\s+/g, " ").slice(0, 85);
}

function isDiscordRateLimitError(error) {
  const message = String(error?.message || error || "");
  return error?.name === "RateLimitError" ||
    error?.constructor?.name === "RateLimitError" ||
    Number(error?.status) === 429 ||
    /rate.?limit|too many requests|429/i.test(message);
}

function isEmojiCapacityError(error) {
  const message = String(error?.message || error || "");
  return Number(error?.code) === 30008 ||
    /maximum number of emojis|maximum number of expressions|emoji slots|emoji limit/i.test(message);
}

function isNetworkTimeout(error) {
  const message = String(error?.message || error || "");
  return /timed out|timeout|abort|ECONNRESET|ECONNREFUSED|UND_ERR/i.test(message);
}

const guardedRestClients = new WeakSet();
function guardEmojiRateLimits(client) {
  const rest = client?.rest;
  if (!rest?.options || guardedRestClients.has(rest)) return;
  const previous = rest.options.rejectOnRateLimit;

  rest.options.rejectOnRateLimit = async rateLimitData => {
    const route = String(rateLimitData?.route || "").toLowerCase();
    if (/^\/guilds\/(?:\d+|:[^/]+)\/emojis(?:\/|$)/i.test(route)) return true;
    if (previous === true) return true;
    if (Array.isArray(previous) && previous.some(prefix => route.startsWith(String(prefix).toLowerCase()))) return true;
    if (typeof previous === "function") {
      try { return Boolean(await previous(rateLimitData)); } catch { return false; }
    }
    return false;
  };
  guardedRestClients.add(rest);
}

async function createEmojiWithBoundedRest(guild, record) {
  const rest = guild.client.rest;
  const oldTimeout = rest?.options?.timeout;
  const oldRetries = rest?.options?.retries;
  if (rest?.options) {
    rest.options.timeout = 12000;
    rest.options.retries = 0;
  }
  try {
    return await guild.emojis.create({
      attachment: record.buffer,
      name: record.item.name,
      reason: "Emoji.gg / catálogos compatibles • pack Flux STORE"
    });
  } finally {
    if (rest?.options) {
      if (oldTimeout != null) rest.options.timeout = oldTimeout;
      if (oldRetries != null) rest.options.retries = oldRetries;
    }
  }
}


async function retryDiscordRateLimited(operation, onWait, maxRetries = 8) {
  const MAX_INLINE_WAIT_MS = 15000;
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isDiscordRateLimitError(error) || attempt >= maxRetries) throw error;
      const suggestedMs = Number(error.retryAfter || error.timeToReset || error.sublimitTimeout) || 1000;
      const waitMs = Math.max(250, suggestedMs + 100);

      // Do not hold an interaction open for minutes or hours. Respect Discord's
      // retry-after by stopping this run instead of trying to bypass the limit.
      if (waitMs > MAX_INLINE_WAIT_MS) {
        const deferred = new Error(
          "Discord exige esperar " + Math.ceil(waitMs / 1000) +
          " segundos. El proceso se pausó para no mantener el comando bloqueado."
        );
        deferred.code = "FLUX_LONG_RATE_LIMIT";
        deferred.retryAfterMs = waitMs;
        throw deferred;
      }

      if (onWait) await onWait(waitMs, attempt + 1);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
}

function maxEmojiSlotsPerType(guild) {
  const tier = Math.max(0, Math.min(3, Number(guild?.premiumTier) || 0));
  return [50, 100, 150, 250][tier];
}


async function askButtonConfirmation(interaction, options) {
  const yesId = "emoji_pack_yes_" + interaction.id;
  const noId = "emoji_pack_no_" + interaction.id;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(yesId)
      .setLabel(options.confirmLabel || "Confirmar")
      .setStyle(options.confirmStyle || ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(noId)
      .setLabel(options.cancelLabel || "Cancelar")
      .setStyle(ButtonStyle.Secondary)
  );
  await interaction.editReply({
    content: options.content,
    embeds: options.embeds || [],
    components: [row]
  });

  let clicked;
  try {
    const message = await interaction.fetchReply();
    clicked = await message.awaitMessageComponent({
      filter: component => component.user.id === interaction.user.id &&
        (component.customId === yesId || component.customId === noId),
      time: 60000
    });
  } catch {
    await interaction.editReply({
      content: options.timeoutText || "La confirmación caducó. No se borró ningún emoji.",
      embeds: [],
      components: []
    }).catch(() => {});
    return false;
  }

  const accepted = clicked.customId === yesId;
  await clicked.update({
    content: accepted
      ? (options.confirmText || "Confirmado.")
      : (options.cancelText || "Cancelado. No se borró ningún emoji."),
    embeds: [],
    components: []
  });
  return accepted;
}

function compareEmojiAge(a, b) {
  // First reuse old emojis from this bot's pack, then the oldest user-uploaded emojis.
  const aPack = /^(flux_|velo_)/i.test(a.name) ? 0 : 1;
  const bPack = /^(flux_|velo_)/i.test(b.name) ? 0 : 1;
  if (aPack !== bPack) return aPack - bPack;
  try {
    const left = BigInt(a.id);
    const right = BigInt(b.id);
    return left < right ? -1 : left > right ? 1 : 0;
  } catch {
    return String(a.id).localeCompare(String(b.id));
  }
}

function makeReplacementEmbed(staticEmojis, animatedEmojis, uploadCount) {
  const embed = new EmbedBuilder()
    .setColor(0xE11D2E)
    .setTitle("Flux STORE • Confirmación de reemplazo")
    .setDescription(
      "Para instalar hasta **" + uploadCount + " emojis nuevos**, hay que borrar exactamente **" +
      (staticEmojis.length + animatedEmojis.length) + " emojis existentes** para liberar espacio. " +
      "No se puede deshacer automáticamente. No se borrará nada hasta que pulses «Confirmar reemplazo»."
    );
  const addNames = (label, list) => {
    for (let i = 0; i < list.length; i += 15) {
      embed.addFields({
        name: label + (list.length > 15 ? " (" + (Math.floor(i / 15) + 1) + ")" : ""),
        value: list.slice(i, i + 15).map(emoji => "• " + emoji.name).join("\n").slice(0, 1024)
      });
    }
  };
  if (staticEmojis.length) addNames("Emojis estáticos que se borrarían", staticEmojis);
  if (animatedEmojis.length) addNames("Emojis animados que se borrarían", animatedEmojis);
  embed.setFooter({ text: "Se priorizan los emojis flux_/velo_ antiguos y después los más antiguos disponibles." });
  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("emojis-pack")
    .setDescription("Instala 120 emojis personalizados reales de Emoji.gg.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
    .addStringOption(option => option
      .setName("pack")
      .setDescription("Elige el pack de imágenes originales")
      .setRequired(true)
      .addChoices(
        { name: PACK_LABELS.staff, value: "staff" },
        { name: PACK_LABELS.owner, value: "owner" },
        { name: PACK_LABELS.tickets, value: "tickets" },
        { name: PACK_LABELS.tienda, value: "tienda" },
        { name: PACK_LABELS.pagos, value: "pagos" },
        { name: PACK_LABELS.verificados, value: "verificados" },
        { name: PACK_LABELS.gaming, value: "gaming" },
        { name: PACK_LABELS.comunidad, value: "comunidad" },
        { name: PACK_LABELS.animados, value: "animados" },
        { name: PACK_LABELS.todo, value: "todo" }
      )),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: "Este comando solo funciona dentro de un servidor.", flags: MessageFlags.Ephemeral });
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return interaction.reply({ content: "Necesitas el permiso Gestionar expresiones.", flags: MessageFlags.Ephemeral });
    }
    if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return interaction.reply({ content: "Flux STORE necesita el permiso Gestionar expresiones.", flags: MessageFlags.Ephemeral });
    }

    const guildId = interaction.guild.id;
    if (activeGuilds.has(guildId)) {
      return interaction.reply({ content: "Ya hay una instalación activa en este servidor. Espera a su resumen.", flags: MessageFlags.Ephemeral });
    }

    activeGuilds.add(guildId);
    guardEmojiRateLimits(interaction.client);
    let deferred = false;
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      deferred = true;

      const selected = interaction.options.getString("pack", true);
      await interaction.editReply({ content: "Flux STORE • Comprobando permisos, espacios y límites de Discord…" });
      let currentEmojis;
      try {
        currentEmojis = await withTimeout(
          interaction.guild.emojis.fetch(),
          10000,
          "Discord no respondió al comprobar los emojis del servidor"
        );
      } catch (error) {
        if (isDiscordRateLimitError(error)) {
          return interaction.editReply({
            content: "Discord mantiene un límite temporal activo en la ruta de emojis. No iniciaré la descarga para evitar otra espera larga. Espera a que termine y vuelve a ejecutar /emojis-pack."
          });
        }
        throw error;
      }
      const initialExistingNames = new Set([...currentEmojis.values()].map(item => item.name));
      const initialTierSlotLimit = maxEmojiSlotsPerType(interaction.guild);
      const initialStaticSlots = Math.max(0, initialTierSlotLimit - [...currentEmojis.values()].filter(emoji => !emoji.animated).length);
      const initialAnimatedSlots = Math.max(0, initialTierSlotLimit - [...currentEmojis.values()].filter(emoji => emoji.animated).length);
      if (initialStaticSlots === 0 && initialAnimatedSlots === 0) {
        const replaceableCount = [...currentEmojis.values()].filter(emoji => !emoji.managed).length;
        if (replaceableCount === 0) {
          return interaction.editReply({
            content: "El servidor está lleno y todos los emojis actuales son gestionados por integraciones. No puedo reemplazarlos desde el bot; no se descargó el pack ni se borró nada."
          });
        }
        const prepare = await askButtonConfirmation(interaction, {
          content: "El servidor ha alcanzado el límite de emojis. Si continúas, prepararé el pack y te mostraré exactamente qué emojis antiguos tendría que reemplazar. No borraré nada sin una segunda confirmación.",
          confirmLabel: "Preparar reemplazo",
          confirmStyle: ButtonStyle.Primary,
          confirmText: "De acuerdo. Prepararé el pack; todavía no se ha borrado ningún emoji.",
          cancelText: "Cancelado. No se descargó el pack ni se borró ningún emoji.",
          timeoutText: "La confirmación caducó. No se descargó el pack ni se borró ningún emoji."
        });
        if (!prepare) return;
      }
      const existingNames = initialExistingNames;
      await interaction.editReply({ content: "Flux STORE • Consultando fuentes de emojis compatibles…" });
      const catalog = await loadCatalog();
      const selection = pickItems(catalog, selected, existingNames);
      const items = selection.items;

      if (!items.length) {
        return interaction.editReply({ content: "No encontré imágenes nuevas compatibles en las fuentes actuales. No se borró ningún emoji." });
      }

      const added = [];
      const skipped = [];
      const failed = [];
      const buffers = new Map();
      const downloadQueue = items.slice();
      let downloadsDone = 0;
      let lastProgressAt = 0;
      let progressQueue = Promise.resolve();

      const progress = (stage, current, total, detail) => {
        const now = Date.now();
        if (current !== total && current % 4 !== 0 && now - lastProgressAt < 900) return progressQueue;
        lastProgressAt = now;
        const message = "Flux STORE • " + stage + " **" + current + "/" + total + "**" +
          "\nInstalados: " + added.length +
          " · Existían: " + skipped.length +
          " · Fallaron: " + failed.length +
          (detail ? "\nActual: " + detail : "");
        progressQueue = progressQueue.then(() => interaction.editReply({ content: message }).catch(() => {}));
        return progressQueue;
      };

      await interaction.editReply({ content: "Flux STORE • Validando " + items.length + " emojis de varias fuentes en paralelo. Se priorizan catálogos alternativos si Emoji.gg devuelve HTTP 403…" });

      const downloadWorker = async () => {
        while (downloadQueue.length) {
          const item = downloadQueue.shift();
          try {
            buffers.set(item.name, { item, buffer: await downloadEmoji(item.url) });
          } catch (error) {
            failed.push(item.name + " (descarga: " + safeError(error) + ")");
          } finally {
            downloadsDone++;
            await progress("Descargando", downloadsDone, items.length, item.name);
          }
        }
      };

      await Promise.all(Array.from(
        { length: Math.min(DOWNLOAD_WORKERS, downloadQueue.length) },
        () => downloadWorker()
      ));
      await progressQueue;

      const uploadCandidates = [...buffers.values()];
      const tierSlotLimit = maxEmojiSlotsPerType(interaction.guild);
      let staticSlotsLeft = Math.max(0, tierSlotLimit - [...currentEmojis.values()].filter(emoji => !emoji.animated).length);
      let animatedSlotsLeft = Math.max(0, tierSlotLimit - [...currentEmojis.values()].filter(emoji => emoji.animated).length);
      const staticRecords = [];
      const animatedRecords = [];
      const deletedNames = [];

      for (const record of uploadCandidates) {
        const metadata = await sharp(record.buffer, { animated: true, limitInputPixels: 16777216 }).metadata();
        const isAnimated = metadata.format === "gif" || Boolean(metadata.pages && metadata.pages > 1);
        record.isAnimated = isAnimated;
        (isAnimated ? animatedRecords : staticRecords).push(record);
      }

      const staticNeeded = Math.max(0, staticRecords.length - staticSlotsLeft);
      const animatedNeeded = Math.max(0, animatedRecords.length - animatedSlotsLeft);
      const deletableStatic = currentEmojis
        .filter(emoji => !emoji.animated && !emoji.managed)
        .sort(compareEmojiAge);
      const deletableAnimated = currentEmojis
        .filter(emoji => emoji.animated && !emoji.managed)
        .sort(compareEmojiAge);
      const plannedStaticDeletes = [...deletableStatic.values()].slice(0, staticNeeded);
      const plannedAnimatedDeletes = [...deletableAnimated.values()].slice(0, animatedNeeded);
      let uploadsDone = 0;
      let uploadStopReason = null;

      if (plannedStaticDeletes.length + plannedAnimatedDeletes.length > 0) {
        const totalPlannedUploads =
          Math.min(staticRecords.length, staticSlotsLeft + plannedStaticDeletes.length) +
          Math.min(animatedRecords.length, animatedSlotsLeft + plannedAnimatedDeletes.length);
        const confirmed = await askButtonConfirmation(interaction, {
          content: "Revisa el listado exacto de emojis que se eliminarían. Puedes cancelar sin cambiar nada.",
          embeds: [makeReplacementEmbed(plannedStaticDeletes, plannedAnimatedDeletes, totalPlannedUploads)],
          confirmLabel: "Confirmar reemplazo",
          confirmStyle: ButtonStyle.Danger,
          confirmText: "Confirmado. Eliminando únicamente los emojis de la lista.",
          cancelText: "Operación cancelada. No se borró ningún emoji.",
          timeoutText: "La confirmación caducó. No se borró ningún emoji."
        });
        if (!confirmed) return;

        const toDelete = [...plannedStaticDeletes, ...plannedAnimatedDeletes];
        for (let index = 0; index < toDelete.length; index++) {
          const emoji = toDelete[index];
          await interaction.editReply({
            content: "Flux STORE • Liberando espacio " + (index + 1) + "/" + toDelete.length +
              "\nActual: " + emoji.name +
              "\nSolo se procesarán los emojis que confirmaste."
          }).catch(() => {});
          try {
            await retryDiscordRateLimited(
              () => emoji.delete("Flux STORE: liberar espacio confirmado para instalar un pack de emojis"),
              async waitMs => {
                await interaction.editReply({
                  content: "Flux STORE • Discord pidió esperar " + Math.ceil(waitMs / 1000) +
                    " s para continuar liberando espacio. No enviaré solicitudes durante esa espera."
                }).catch(() => {});
              }
            );
            deletedNames.push(emoji.name);
          } catch (error) {
            failed.push(emoji.name + " (no se pudo reemplazar: " + safeError(error) + ")");
            if (error?.code === "FLUX_LONG_RATE_LIMIT") {
              uploadStopReason = error.message + " Vuelve a ejecutar /emojis-pack cuando haya pasado ese tiempo.";
            } else if (isDiscordRateLimitError(error)) {
              uploadStopReason = "Discord activó un límite temporal al liberar espacio. Se detuvo el proceso.";
            } else if (Number(error?.status) === 403) {
              uploadStopReason = "Discord rechazó la eliminación por permisos. Comprueba Gestionar expresiones.";
            } else {
              uploadStopReason = "No se pudieron borrar todos los emojis confirmados; el proceso se detuvo por seguridad.";
            }
            break;
          }
        }

        if (deletedNames.length) {
          try {
            currentEmojis = await withTimeout(
              interaction.guild.emojis.fetch(),
              10000,
              "Discord no respondió al actualizar el inventario"
            );
          } catch (error) {
            uploadStopReason = uploadStopReason || ("No se pudo comprobar el espacio liberado: " + safeError(error));
          }
        }
      }

      // Recalculate capacity using Discord's actual inventory after replacements.
      staticSlotsLeft = Math.max(0, tierSlotLimit - [...currentEmojis.values()].filter(emoji => !emoji.animated).length);
      animatedSlotsLeft = Math.max(0, tierSlotLimit - [...currentEmojis.values()].filter(emoji => emoji.animated).length);
      const staticToUpload = staticRecords.slice(0, staticSlotsLeft);
      const animatedToUpload = animatedRecords.slice(0, animatedSlotsLeft);
      const uploadQueue = [...staticToUpload, ...animatedToUpload];

      for (const record of staticRecords.slice(staticToUpload.length)) {
        skipped.push(record.item.name + " (sin espacio estático disponible)");
      }
      for (const record of animatedRecords.slice(animatedToUpload.length)) {
        skipped.push(record.item.name + " (sin espacio animado disponible)");
      }

      if (!uploadCandidates.length) {
        uploadStopReason = uploadStopReason || "No se pudo validar ninguna imagen descargada de las fuentes.";
      } else if (!uploadQueue.length && !uploadStopReason) {
        uploadStopReason = "No quedaron espacios disponibles ni emojis antiguos que se puedan reemplazar.";
      }

      const uploadWorker = async () => {
        while (uploadQueue.length && !uploadStopReason) {
          const record = uploadQueue.shift();
          await interaction.editReply({
            content: "Flux STORE • Subiendo a Discord " + (uploadsDone + 1) + "/" + (staticToUpload.length + animatedToUpload.length) +
              "\nInstalados: " + added.length +
              " · Reemplazados: " + deletedNames.length +
              " · Omitidos: " + skipped.length +
              " · Fallaron: " + failed.length +
              "\nActual: " + record.item.name
          }).catch(() => {});

          try {
            const created = await retryDiscordRateLimited(
              () => createEmojiWithBoundedRest(interaction.guild, record),
              async waitMs => {
                await interaction.editReply({
                  content: "Flux STORE • Límite de Discord: esperando " + Math.ceil(waitMs / 1000) +
                    " s antes de continuar la subida. No se acumularán solicitudes."
                }).catch(() => {});
              }
            );
            added.push("<:" + created.name + ":" + created.id + "> " + record.item.name);
            if (record.isAnimated) animatedSlotsLeft = Math.max(0, animatedSlotsLeft - 1);
            else staticSlotsLeft = Math.max(0, staticSlotsLeft - 1);
          } catch (error) {
            failed.push(record.item.name + " (Discord: " + safeError(error) + ")");
            if (error?.code === "FLUX_LONG_RATE_LIMIT") {
              uploadStopReason = error.message + " No se intentarán más subidas en esta ejecución.";
            } else if (isDiscordRateLimitError(error)) {
              uploadStopReason = "Discord activó un límite temporal. El bot se detuvo sin acumular más solicitudes; espera antes de repetir el comando.";
            } else if (isEmojiCapacityError(error)) {
              uploadStopReason = "Discord indicó que no quedan espacios para este tipo de emoji.";
            } else if (isNetworkTimeout(error)) {
              uploadStopReason = "Discord no respondió dentro del tiempo límite. El bot se detuvo para no dejar más subidas atascadas.";
            } else if (Number(error?.status) === 403) {
              uploadStopReason = "Discord rechazó la subida por permisos. Comprueba Gestionar expresiones.";
            }
          } finally {
            uploadsDone++;
            await progress("Subiendo", uploadsDone, staticToUpload.length + animatedToUpload.length, record.item.name);
          }
        }
      };

      await uploadWorker();
      if (uploadStopReason && uploadQueue.length) {
        failed.push(uploadQueue.length + " emojis no intentados. " + uploadStopReason);
      }

      const embed = new EmbedBuilder()
        .setColor(config.colors?.primary || 0x8B5CF6)
        .setTitle(uploadStopReason ? "Flux STORE • Pack pausado" : "Flux STORE • Pack de emojis terminado")
        .setURL("https://emoji.gg/")
        .setDescription(
          "Se validó el formato de cada imagen y se comprobaron los espacios del servidor. Se priorizan fuentes alternativas cuando están disponibles; algunos enlaces de Emoji.gg pueden responder HTTP 403 desde el hosting.\n\n" +
          "Instalados: " + added.length + "\n" +
          "Reemplazados para liberar espacio: " + deletedNames.length + "\n" +
          "Omitidos / sin espacio: " + skipped.length + "\n" +
          "Fallaron: " + failed.length + "\n" +
          "Objetivo solicitado: " + selection.target + "\nDisponibles en fuentes: " + selection.available + "\n\n" +
          "Espacios restantes estimados: " + staticSlotsLeft + " estáticos y " + animatedSlotsLeft + " animados.\n" +
          (uploadStopReason ? "Motivo de pausa: " + uploadStopReason : "El lote terminó sin interrupción del límite de subidas.")
        )
        .setFooter({ text: "Flux STORE • Emoji.gg · respeta las licencias de cada autor" })
        .setTimestamp();

      if (added.length) embed.addFields({
        name: "Instalados (muestra)",
        value: added.slice(0, 12).join("\n").slice(0, 1024)
      });
      if (deletedNames.length) embed.addFields({
        name: "Emojis reemplazados (muestra)",
        value: deletedNames.slice(0, 12).map(name => "• " + name).join("\n").slice(0, 1024)
      });
      if (failed.length) embed.addFields({
        name: "Fallos (muestra)",
        value: failed.slice(0, 8).join("\n").slice(0, 1024)
      });

      return interaction.editReply({ content: null, embeds: [embed] });
    } catch (error) {
      console.error("[Emoji.gg pack] Error:", error);
      const message = isDiscordRateLimitError(error) ? "Discord mantiene un límite temporal activo en las subidas de emojis. No hice más intentos; espera y vuelve a ejecutar /emojis-pack." : "No pude completar el pack: " + safeError(error) + ". Revisa los permisos y los registros de Railway.";
      if (interaction.deferred || deferred) return interaction.editReply({ content: message, embeds: [] }).catch(() => {});
      return interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
    } finally {
      activeGuilds.delete(guildId);
    }
  }
};
