const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const config = require("./config");
const { find, NAMES } = require("./ui");

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

const SMART_NAMES = {
  soporte: ["velosupport", "velosoporte", "soporte", "support", "help", "ayuda"],
  comprar: ["velobuy", "velobuying", "velocomprar", "comprar", "compra", "buy", "shop", "store", "tienda", "cart", "carrito", "money", "price", "precios"],
  reclamos: ["veloreclaim", "veloclaim", "veloreclamos", "reclamos", "reclamo", "reclaim", "claim", "report", "reporte", "warning", "problem", "problema"],
  otros: ["veloother", "velootros", "otros", "other", "misc", "general", "ticket"]
};

// Prioriza emojis personalizados con nombres del tipo correcto y evita repetir el mismo
// emoji en dos opciones cuando el servidor tiene suficientes emojis.
function getEmoji(guild, category, type, used = new Set()) {
  if (!guild?.emojis?.cache) return undefined;
  const available = [...guild.emojis.cache.values()].filter(e => e.available !== false && !used.has(e.id));

  const aliases = NAMES[category?.emojiKey] || [];
  const words = SMART_NAMES[type] || [];
  const scoreEmoji = e => {
    const name = normalize(e.name);
    let score = 0;
    for (const alias of aliases) {
      const a = normalize(alias);
      if (a && name === a) score = Math.max(score, 120);
      else if (a && name.includes(a)) score = Math.max(score, 70);
    }
    for (const word of words) {
      const w = normalize(word);
      if (w && name === w) score = Math.max(score, 110);
      else if (w && name.includes(w)) score = Math.max(score, 55);
    }
    return score;
  };

  const best = available.map(e => ({ e, score: scoreEmoji(e) }))
    .filter(x => x.score > 0).sort((a, b) => b.score - a.score)[0];
  if (best) return best.e;

  // Si no hay coincidencia semántica, usa los emojis configurados solo si pertenecen al servidor.
  const configured = category?.emojiId && guild.emojis.cache.get(category.emojiId);
  if (configured && configured.available !== false && !used.has(configured.id)) return configured;

  const byName = category?.emojiName && available.find(e => normalize(e.name) === normalize(category.emojiName));
  return byName;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("Publica el panel de tickets con emojis personalizados.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(i) {
    const categories = config.ticket.categories;
    const used = new Set();

    const options = Object.entries(categories).map(([value, c]) => {
      const option = {
        label: c.label,
        value,
        description: String(c.description || "Abrir un ticket.").slice(0, 100)
      };
      const e = getEmoji(i.guild, c, value, used);
      if (e) {
        option.emoji = { id: e.id, name: e.name, animated: e.animated };
        used.add(e.id);
      }
      return option;
    });

    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket_create")
      .setPlaceholder("Selecciona el tipo de ticket")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options);

    const usedInEmbed = new Set();
    const lines = Object.entries(categories).map(([type, c]) => {
      const e = getEmoji(i.guild, c, type, usedInEmbed);
      if (e) usedInEmbed.add(e.id);
      return (e ? e.toString() + " " : "") + "**" + c.label + "** — " + String(c.description || "Soporte.");
    });

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle("Velo Studio • Tickets")
      .setDescription("Necesitas ayuda? Abre un ticket y el equipo de Velo Studio te atenderá.\n\n" + lines.join("\n"))
      .setFooter({ text: "Velo Studio • Sistema de soporte" })
      .setTimestamp();

    await i.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu)]
    });
  }
};
