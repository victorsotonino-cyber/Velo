const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags
} = require("discord.js");
const config = require("./config");
const sharp = require("sharp");

const API_URL = "https://emoji.gg/api";
const MAX_PACK_SIZE = 120;
const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;
const CATALOG_TIMEOUT_MS = 20000;
const DOWNLOAD_TIMEOUT_MS = 8000;
const UPLOAD_TIMEOUT_MS = 20000;
const DOWNLOAD_WORKERS = 10;
const UPLOAD_WORKERS = 2;

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

async function loadCatalog() {
  if (catalogCache && Date.now() < catalogCacheUntil) return catalogCache;
  if (catalogRequest) return catalogRequest;

  catalogRequest = (async () => {
    const response = await fetch(API_URL, {
      signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
      headers: { "User-Agent": "FluxSTORE-EmojiInstaller/3.0", "Accept": "application/json" }
    });
    if (!response.ok) throw new Error("Emoji.gg API respondió HTTP " + response.status);
    const body = await response.json();
    if (!Array.isArray(body)) throw new Error("Emoji.gg devolvió un catálogo inválido");

    const seen = new Set();
    const entries = [];
    for (const item of body) {
      if (!item || !item.title || !item.image || item.id == null) continue;
      const name = makeEmojiName(item);
      let parsed;
      try { parsed = new URL(item.image); } catch { continue; }
      if (parsed.protocol !== "https:" || parsed.hostname !== "cdn3.emoji.gg") continue;
      if (!/\.(png|gif)$/i.test(parsed.pathname)) continue;
      const searchable = (String(item.title) + " " + String(item.slug || "") + " " + String(item.description || "")).toLowerCase();
      if (BLOCKED.test(searchable) || seen.has(name)) continue;
      seen.add(name);
      entries.push({ id: String(item.id), name, title: String(item.title), url: parsed.href, faves: Number(item.faves) || 0, searchable });
    }

    if (entries.length < MAX_PACK_SIZE) throw new Error("Emoji.gg devolvió solo " + entries.length + " imágenes válidas");
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
  const sorted = entries.slice().sort((a, b) => b.faves - a.faves);
  const available = sorted.filter(item => !existingNames.has(item.name));
  const target = selected === "todo" ? MAX_PACK_SIZE : (selected === "animados" ? 30 : 25);
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

  return { items: picked, target };
}

async function downloadEmoji(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "cdn3.emoji.gg") {
    throw new Error("el enlace no pertenece al CDN seguro de Emoji.gg");
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    headers: { "User-Agent": "FluxSTORE-EmojiInstaller/3.1" }
  });
  if (!response.ok) throw new Error("Emoji.gg HTTP " + response.status);

  const input = Buffer.from(await response.arrayBuffer());
  if (!input.length) throw new Error("imagen vacía");
  if (input.length > MAX_DOWNLOAD_BYTES) throw new Error("imagen original mayor de 8 MB");

  const png = input.length >= 8 && input.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const gif = input.length >= 6 && ["GIF87a", "GIF89a"].includes(input.subarray(0,6).toString("ascii"));
  if (!png && !gif) throw new Error("el enlace no devolvió PNG/GIF válido");

  // Discord bot uploads have a much stricter size cap than Emoji.gg originals.
  // Resize/compress while preserving animation for GIFs.
  for (const size of [128, 96, 64]) {
    const image = sharp(input, { animated: gif, limitInputPixels: 16777216 })
      .resize(size, size, { fit: "inside", withoutEnlargement: true });

    const output = gif
      ? await image.gif({ quality: 78, effort: 10, dither: 0.7 }).toBuffer()
      : await image.png({ palette: true, quality: 82, effort: 10, compressionLevel: 9 }).toBuffer();

    if (output.length <= 256 * 1024) return output;
  }

  throw new Error("no se pudo comprimir por debajo de 256 KB sin perder el formato");
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
  if (/timed out|timeout|abort/i.test(message)) return "tiempo agotado";
  return message.replace(/\s+/g, " ").slice(0, 85);
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
    let deferred = false;
    try {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      deferred = true;

      const selected = interaction.options.getString("pack", true);
      await interaction.editReply({ content: "Flux STORE • Consultando el catálogo oficial de Emoji.gg…" });
      const catalog = await loadCatalog();
      const existingNames = new Set(interaction.guild.emojis.cache.map(item => item.name));
      const selection = pickItems(catalog, selected, existingNames);
      const items = selection.items;

      if (!items.length) {
        return interaction.editReply({ content: "No encontré suficientes imágenes nuevas de ese tipo en Emoji.gg." });
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

      await interaction.editReply({ content: "Flux STORE • Descargando " + items.length + " emojis reales de Emoji.gg en paralelo…" });

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

      const uploadQueue = [...buffers.values()];
      let uploadsDone = 0;
      let consecutiveTimeouts = 0;

      const uploadWorker = async () => {
        while (uploadQueue.length && consecutiveTimeouts < 3) {
          const record = uploadQueue.shift();
          await interaction.editReply({
            content: "Flux STORE • Subiendo a Discord " + (uploadsDone + 1) + "/" + buffers.size +
              "\nInstalados: " + added.length +
              " · Existían: " + skipped.length +
              " · Fallaron: " + failed.length +
              "\nActual: " + record.item.name
          }).catch(() => {});

          try {
            const created = await withTimeout(
              interaction.guild.emojis.create({
                attachment: record.buffer,
                name: record.item.name,
                reason: "Emoji.gg original pack for Flux STORE"
              }),
              UPLOAD_TIMEOUT_MS,
              "Discord no respondió al subir " + record.item.name
            );
            added.push("<:" + created.name + ":" + created.id + "> " + record.item.name);
            consecutiveTimeouts = 0;
          } catch (error) {
            failed.push(record.item.name + " (Discord: " + safeError(error) + ")");
            if (/no respondió|más de 20 s|timed out|timeout/i.test(String(error?.message || ""))) {
              consecutiveTimeouts++;
            } else {
              consecutiveTimeouts = 0;
            }
          } finally {
            uploadsDone++;
            await progress("Subiendo", uploadsDone, buffers.size, record.item.name);
          }
        }
      };

      await Promise.all(Array.from(
        { length: Math.min(UPLOAD_WORKERS, uploadQueue.length) },
        () => uploadWorker()
      ));

      if (consecutiveTimeouts >= 3 && uploadQueue.length) {
        failed.push(uploadQueue.length + " emojis no intentados porque Discord dejó de responder.");
      }

      const embed = new EmbedBuilder()
        .setColor(config.colors?.primary || 0x8B5CF6)
        .setTitle("Flux STORE • Pack de Emoji.gg terminado")
        .setURL("https://emoji.gg/")
        .setDescription(
          "Se usaron imágenes PNG/GIF originales de Emoji.gg.\n\n" +
          "Instalados: " + added.length + "\n" +
          "Ya existían: " + skipped.length + "\n" +
          "Fallaron: " + failed.length + "\n" +
          "Objetivo del pack: " + selection.target + "\n\n" +
          "La velocidad de subida depende de los límites de Discord."
        )
        .setFooter({ text: "Flux STORE • Emoji.gg · respeta las licencias de cada autor" })
        .setTimestamp();

      if (added.length) embed.addFields({
        name: "Instalados (muestra)",
        value: added.slice(0, 12).join("\n").slice(0, 1024)
      });
      if (failed.length) embed.addFields({
        name: "Fallos (muestra)",
        value: failed.slice(0, 8).join("\n").slice(0, 1024)
      });

      return interaction.editReply({ content: null, embeds: [embed] });
    } catch (error) {
      console.error("[Emoji.gg pack] Error:", error);
      const message = "No pude completar el pack: " + safeError(error) + ". Revisa los permisos y los registros de Railway.";
      if (interaction.deferred || deferred) return interaction.editReply({ content: message, embeds: [] }).catch(() => {});
      return interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
    } finally {
      activeGuilds.delete(guildId);
    }
  }
};
