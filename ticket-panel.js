const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const config = require("./config");
const { emoji } = require("./ui");

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
      .addOptions(Object.entries(categories).map(([value, c]) => ({
        label: c.label,
        value,
        description: c.description.slice(0, 100),
        emoji: { id: c.emojiId, name: c.emojiName }
      })));

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(emoji(i.guild, "velo_ticket", "🎫") + " Tickets • Velo Studio")
      .setDescription(
        "¿Necesitas ayuda? Abre un ticket y el equipo de Velo Studio te atenderá.\n\n" +
        Object.values(categories).map(c => "• **" + c.label + "** — " + c.description).join("\n")
      )
      .setFooter({ text: "Velo Studio • Sistema de soporte" })
      .setTimestamp();

    await i.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu)]
    });
  }
};
