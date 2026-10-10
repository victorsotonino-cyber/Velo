const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require("discord.js");
const config = require("./config");
const { NAMES } = require("./ui");

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const SMART_NAMES = {
  soporte: ["velosupport", "velosoporte", "soporte", "support", "ayuda", "help"],
  comprar: ["velobuy", "velocomprar", "comprar", "compra", "shop", "store", "tienda", "carrito"],
  reclamos: ["veloreclaim", "veloclaim", "veloreclamos", "reclamos", "reclamo", "claim", "reporte"],
  otros: ["veloother", "velootros", "otros", "other", "general", "misc"]
};

function findEmoji(guild, category, type, used = new Set()) {
  if (!guild?.emojis?.cache) return undefined;

  // Primero intenta usar el emoji configurado para esta categoría.
  const configured = category?.emojiId
    ? guild.emojis.cache.get(category.emojiId)
    : undefined;
  if (configured && configured.available !== false && !used.has(configured.id)) {
    return configured;
  }

  const available = [...guild.emojis.cache.values()]
    .filter(e => e.available !== false && !used.has(e.id));

  const aliases = NAMES[category?.emojiKey] || [];
  const words = SMART_NAMES[type] || [];
  const score = emoji => {
    const name = normalize(emoji.name);
    let value = 0;

    for (const alias of aliases) {
      const a = normalize(alias);
      if (a && name === a) value = Math.max(value, 120);
      else if (a && name.includes(a)) value = Math.max(value, 75);
    }
    for (const word of words) {
      const w = normalize(word);
      if (w && name === w) value = Math.max(value, 110);
      else if (w && name.includes(w)) value = Math.max(value, 60);
    }
    return value;
  };

  const match = available
    .map(emoji => ({ emoji, score: score(emoji) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)[0];

  if (match) return match.emoji;

  const byName = category?.emojiName
    ? available.find(e => normalize(e.name) === normalize(category.emojiName))
    : undefined;
  return byName;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("Publica el panel de soporte de Velo Studio.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.guild) {
      return interaction.reply({
        content: "❌ Este comando solo se puede usar dentro de un servidor.",
        ephemeral: true
      });
    }

    const categories = Object.entries(config.ticket.categories || {});
    if (!categories.length) {
      return interaction.reply({
        content: "❌ No hay categorías de tickets configuradas.",
        ephemeral: true
      });
    }

    const usedMenu = new Set();
    const options = categories.map(([value, category]) => {
      const option = {
        label: String(category.label || value).slice(0, 100),
        value,
        description: String(category.description || "Abre un ticket con el equipo.").slice(0, 100)
      };

      const customEmoji = findEmoji(interaction.guild, category, value, usedMenu);
      if (customEmoji) {
        option.emoji = { id: customEmoji.id, name: customEmoji.name, animated: customEmoji.animated };
        usedMenu.add(customEmoji.id);
      }
      return option;
    });

    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket_create")
      .setPlaceholder("🎫 Selecciona una categoría")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options);

    const usedEmbed = new Set();
    const categoryLines = categories.map(([type, category]) => {
      const customEmoji = findEmoji(interaction.guild, category, type, usedEmbed);
      if (customEmoji) usedEmbed.add(customEmoji.id);

      const emojiText = customEmoji ? customEmoji.toString() : "🎫";
      return emojiText + " **" + String(category.label || type) + "** — " +
        String(category.description || "Contacta con el equipo de soporte.");
    });

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle("🎫 Velo Studio | Centro de soporte")
      .setDescription(
        "¿Necesitas ayuda? Selecciona la categoría que mejor describa tu consulta y abre un ticket. Nuestro equipo te atenderá en cuanto esté disponible.\n\n" +
        categoryLines.join("\n")
      )
      .setFooter({ text: "Velo Studio • Atención y soporte" })
      .setTimestamp();

    return interaction.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu)]
    });
  }
};
