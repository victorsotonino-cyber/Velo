const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const config = require("./config");
const { find } = require("./ui");

function getEmoji(guild, category) {
  if (!guild) return undefined;

  // 1) ID configurado, si sigue existiendo.
  if (category?.emojiId) {
    const byId = guild.emojis.cache.get(category.emojiId);
    if (byId) return { id: byId.id, name: byId.name, animated: byId.animated };
  }

  // 2) Nombre configurado.
  if (category?.emojiName) {
    const byName = guild.emojis.cache.find(e => e.name === category.emojiName);
    if (byName) return { id: byName.id, name: byName.name, animated: byName.animated };
  }

  // 3) Alias de ui.js (Velo_Buy, comprar, buy, Velo_Reclaim, reclamos, etc.).
  if (category?.emojiKey) {
    const byAlias = find(guild, require("./ui").NAMES[category.emojiKey] || []);
    if (byAlias) return { id: byAlias.id, name: byAlias.name, animated: byAlias.animated };
  }

  return undefined;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("Publica el panel profesional de tickets.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(i) {
    const categories = config.ticket.categories;

    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket_create")
      .setPlaceholder("Selecciona el tipo de ticket")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        Object.entries(categories).map(([value, c]) => {
          const option = {
            label: c.label,
            value,
            description: String(c.description || "Abrir un ticket.").slice(0, 100)
          };

          const e = getEmoji(i.guild, c);
          if (e) option.emoji = { id: e.id, name: e.name, animated: e.animated };

          return option;
        })
      );

    const lines = Object.values(categories).map(c => {
      const e = getEmoji(i.guild, c);
      const prefix = e
        ? "<" + (e.animated ? "a" : "") + ":" + e.name + ":" + e.id + "> "
        : "";
      return prefix + "**" + c.label + "** — " + String(c.description || "Soporte.");
    });

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle("Velo Studio • Tickets")
      .setDescription(
        "Necesitas ayuda? Abre un ticket y el equipo de Velo Studio te atenderá.\n\n" +
        lines.join("\n")
      )
      .setFooter({ text: "Velo Studio • Sistema de soporte" })
      .setTimestamp();

    await i.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu)]
    });
  }
};
