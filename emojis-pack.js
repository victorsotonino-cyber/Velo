const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags
} = require("discord.js");
const config = require("./config");

const CDN = "https://cdn3.emoji.gg/emojis/";

// Real PNG/GIF files on Emoji.gg; no Unicode-to-image conversion.
const PACKS = {
  staff: [
    ["gg_staff_role", CDN + "24307-staff-role-icon.png"],
    ["gg_admin_blue", CDN + "958314-adminroleicon.png"],
    ["gg_admin_purple", CDN + "243490-adminroleicon.png"],
    ["gg_admin_coloured", CDN + "511035-adminroleicon.png"]
  ],
  owner: [
    ["gg_owner_holo", CDN + "221415-holographicownerroleicon.png"],
    ["gg_owner_black", CDN + "928868-blackownerroleicon.png"]
  ],
  tickets: [
    ["gg_ticket_gif", CDN + "993547-maketicket.gif"],
    ["gg_ticket_support", CDN + "51198-ticketsupportroleicon.png"],
    ["gg_ticket_helper", CDN + "382459-tickethelper.png"],
    ["gg_ticket_nitro", CDN + "148365-ticket-nitro.png"],
    ["gg_ticket_catgray", CDN + "39819-graycatticket.png"],
    ["gg_ticket_catpink", CDN + "418996-pinkcatticket.png"],
    ["gg_ticket_catwhite", CDN + "12130-whitecatticket.png"]
  ],
  tienda: [
    ["gg_cart_gif", CDN + "662519-shopping-cart.gif"],
    ["gg_cart_icon", CDN + "9851-shoppingcart.png"],
    ["gg_shopeepay", CDN + "273651-shopeepay.png"],
    ["gg_sellix", CDN + "37700-sellix-logo.png"],
    ["gg_stripe", CDN + "71388-stripe.png"]
  ],
  pagos: [
    ["gg_paypal", CDN + "7361-paypal.png"],
    ["gg_paypal_blue", CDN + "73640-paypal.png"],
    ["gg_paypal_alt", CDN + "1231-paypal.png"],
    ["gg_binance", CDN + "77525-binance.png"]
  ],
  verificados: [
    ["gg_verified_spotify", CDN + "85294-verified.png"],
    ["gg_verified_check", CDN + "8030-verified.png"],
    ["gg_verified_badge", CDN + "2572-verified-badge.png"],
    ["gg_verified_badge_alt", CDN + "48997-verifiedbadge.png"]
  ],
  animados: [
    ["gg_ticket_gif", CDN + "993547-maketicket.gif"],
    ["gg_cart_gif", CDN + "662519-shopping-cart.gif"],
    ["gg_cart_icon", CDN + "9851-shoppingcart.png"]
  ]
};

const LABELS = {
  staff: "Staff y moderación",
  owner: "Owner",
  tickets: "Tickets",
  tienda: "Tienda",
  pagos: "Pagos",
  verificados: "Verificados",
  animados: "Animados",
  todo: "Todos los packs Emoji.gg"
};

const activeGuilds = new Set();
const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 6000;
const DOWNLOAD_WORKERS = 8;
const UPLOAD_WORKERS = 2;

function getItems(selected) {
  const keys = selected === "todo"
    ? ["staff", "owner", "tickets", "tienda", "pagos", "verificados"]
    : [selected];
  const result = [];
  const seen = new Set();

  for (const key of keys) {
    for (const entry of PACKS[key] || []) {
      if (seen.has(entry[0])) continue;
      seen.add(entry[0]);
      result.push({ name: entry[0], url: entry[1] });
    }
  }
  return result;
}

async function downloadEmoji(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.hostname !== "cdn3.emoji.gg") {
    throw new Error("El enlace no pertenece al CDN seguro de Emoji.gg");
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    headers: { "User-Agent": "FluxSTORE-EmojiInstaller/2.0" }
  });

  if (!response.ok) throw new Error("Emoji.gg respondió HTTP " + response.status);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error("Imagen vacía");
  if (buffer.length > MAX_DOWNLOAD_BYTES) throw new Error("Imagen demasiado grande (máximo 8 MB)");

  // Accept actual PNG/GIF bytes even when a CDN sends a generic MIME type.
  const png = buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const gif = buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"));
  if (!png && !gif) throw new Error("El enlace no devolvió un PNG/GIF válido");
  return buffer;
}

function safeError(error) {
  const message = String(error?.message || error || "Error desconocido");
  if (/timed out|timeout|abort/i.test(message)) return "tiempo agotado descargando";
  return message.replace(/\s+/g, " ").slice(0, 80);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("emojis-pack")
    .setDescription("Instala imágenes PNG/GIF reales de Emoji.gg.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
    .addStringOption(option => option
      .setName("pack")
      .setDescription("Elige el pack de Emoji.gg")
      .setRequired(true)
      .addChoices(
        { name: LABELS.staff, value: "staff" },
        { name: LABELS.owner, value: "owner" },
        { name: LABELS.tickets, value: "tickets" },
        { name: LABELS.tienda, value: "tienda" },
        { name: LABELS.pagos, value: "pagos" },
        { name: LABELS.verificados, value: "verificados" },
        { name: LABELS.animados, value: "animados" },
        { name: LABELS.todo, value: "todo" }
      )),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: "Este comando solo funciona dentro de un servidor.",
        flags: MessageFlags.Ephemeral
      });
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return interaction.reply({
        content: "Necesitas el permiso Gestionar expresiones.",
        flags: MessageFlags.Ephemeral
      });
    }

    if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return interaction.reply({
        content: "Flux STORE necesita el permiso Gestionar expresiones.",
        flags: MessageFlags.Ephemeral
      });
    }

    const guildId = interaction.guild.id;
    if (activeGuilds.has(guildId)) {
      return interaction.reply({
        content: "Ya hay un pack ejecutándose en este servidor. Espera al resumen final para iniciar otro.",
        flags: MessageFlags.Ephemeral
      });
    }

    activeGuilds.add(guildId);
    let deferred = false;

    try {
      const selected = interaction.options.getString("pack", true);
      const items = getItems(selected);
      if (!items.length) {
        return interaction.reply({
          content: "No encontré imágenes para ese pack.",
          flags: MessageFlags.Ephemeral
        });
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      deferred = true;

      const added = [];
      const skipped = [];
      const failed = [];
      const cached = new Set(interaction.guild.emojis.cache.map(emoji => emoji.name));
      const pending = [];

      for (const item of items) {
        if (cached.has(item.name)) skipped.push(item.name + " (ya existe)");
        else pending.push(item);
      }

      if (!pending.length) {
        const embed = new EmbedBuilder()
          .setColor(config.colors?.primary || 0x8B5CF6)
          .setTitle("Flux STORE • Emoji.gg")
          .setDescription("Este pack ya está instalado. No hay nada nuevo que subir.")
          .addFields({ name: "Ya existían", value: String(skipped.length) })
          .setURL("https://emoji.gg/");
        return interaction.editReply({ content: null, embeds: [embed] });
      }

      let downloadsFinished = 0;
      let lastProgressAt = 0;
      let progressChain = Promise.resolve();
      const buffers = new Map();
      const queue = pending.slice();

      const updateProgress = (stage, current, total, detail) => {
        const now = Date.now();
        if (current !== total && now - lastProgressAt < 900 && current % 3 !== 0) return progressChain;
        lastProgressAt = now;
        const message = "Flux STORE • " + stage + " " + current + "/" + total +
          "\nAñadidos: " + added.length +
          " · Existían: " + skipped.length +
          " · Fallaron: " + failed.length +
          (detail ? "\nÚltimo: " + detail : "");
        progressChain = progressChain.then(() => interaction.editReply({ content: message }).catch(() => {}));
        return progressChain;
      };

      await interaction.editReply({
        content: "Flux STORE • Descargando " + pending.length + " imágenes de Emoji.gg en paralelo…"
      });

      const downloadWorker = async () => {
        while (queue.length) {
          const item = queue.shift();
          try {
            const buffer = await downloadEmoji(item.url);
            buffers.set(item.name, { item, buffer });
          } catch (error) {
            failed.push(item.name + " (descarga: " + safeError(error) + ")");
          } finally {
            downloadsFinished++;
            await updateProgress("Descargando", downloadsFinished, pending.length, item.name);
          }
        }
      };

      await Promise.all(Array.from(
        { length: Math.min(DOWNLOAD_WORKERS, pending.length) },
        () => downloadWorker()
      ));
      await progressChain;

      const uploadQueue = [...buffers.values()];
      let uploadsFinished = 0;

      const uploadWorker = async () => {
        while (uploadQueue.length) {
          const record = uploadQueue.shift();
          try {
            const emoji = await interaction.guild.emojis.create({
              attachment: record.buffer,
              name: record.item.name,
              reason: "Original Emoji.gg PNG/GIF pack for Flux STORE"
            });
            added.push("<:" + emoji.name + ":" + emoji.id + "> " + record.item.name);
          } catch (error) {
            failed.push(record.item.name + " (Discord: " + safeError(error) + ")");
          } finally {
            uploadsFinished++;
            await updateProgress("Subiendo a Discord", uploadsFinished, buffers.size || 1, record.item.name);
          }
        }
      };

      if (uploadQueue.length) {
        await Promise.all(Array.from(
          { length: Math.min(UPLOAD_WORKERS, uploadQueue.length) },
          () => uploadWorker()
        ));
      }

      const embed = new EmbedBuilder()
        .setColor(config.colors?.primary || 0x8B5CF6)
        .setTitle("Flux STORE • Instalación Emoji.gg terminada")
        .setURL("https://emoji.gg/")
        .setDescription(
          "Se procesaron imágenes PNG/GIF originales de Emoji.gg.\n\n" +
          "Instalados: " + added.length + "\n" +
          "Ya existían: " + skipped.length + "\n" +
          "Fallaron: " + failed.length + "\n\n" +
          "Las descargas se hacen en paralelo. La subida final depende de los límites de Discord."
        )
        .setFooter({ text: "Flux STORE • Imágenes originales de Emoji.gg" })
        .setTimestamp();

      if (added.length) embed.addFields({
        name: "Emojis instalados (muestra)",
        value: added.slice(0, 12).join("\n").slice(0, 1024)
      });
      if (failed.length) embed.addFields({
        name: "Fallos (muestra)",
        value: failed.slice(0, 10).join("\n").slice(0, 1024)
      });

      return interaction.editReply({ content: null, embeds: [embed] });
    } catch (error) {
      console.error("[Emoji.gg pack] Error:", error);
      const message = "No pude completar el pack: " + safeError(error) + ". Revisa los permisos y los registros de Railway.";
      if (interaction.deferred || deferred) {
        return interaction.editReply({ content: message, embeds: [] }).catch(() => {});
      }
      return interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
    } finally {
      activeGuilds.delete(guildId);
    }
  }
};
