const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const config = require("./config");

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
        Object.entries(categories).map(([value, c]) => ({
          label: c.label,
          value,
          description: String(c.description || "Abrir un ticket.").slice(0, 100),
          emoji: {
            id: c.emojiId || undefined,
            name: c.emojiName || undefined
          }
        }))
      );

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle("Velo Studio • Tickets")
      .setDescription(
        "Necesitas ayuda? Abre un ticket y el equipo de Velo Studio te atenderá.\n\n" +
        Object.values(categories)
          .map(c => {
            const emoji = c.emojiId
              ? "<:" + c.emojiName + ":" + c.emojiId + ">"
              : "🎫";
            return emoji + " **" + c.label + "** — " + String(c.description || "Soporte.");
          })
          .join("\n")
      )
      .setFooter({ text: "Velo Studio • Sistema de soporte" })
      .setTimestamp();

    await i.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu)]
    });
  }
};
