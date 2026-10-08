const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const config = require("./config");
const { emojiData, emoji } = require("./ui");

function optionEmoji(guild, key) {
  const data = emojiData(guild, key, "🎫");
  return data.id ? { id: data.id, name: data.name, animated: data.animated } : { name: data.name };
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
        Object.entries(categories).map(([value, c]) => ({
          label: c.label,
          value,
          description: String(c.description || "Abrir un ticket.").slice(0, 100),
          emoji: optionEmoji(i.guild, c.emojiKey)
        }))
      );

    const lines = Object.values(categories).map(c =>
      emoji(i.guild, c.emojiKey, "🎫") + " **" + c.label + "** — " + String(c.description || "Soporte.")
    );

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(emoji(i.guild, "velo_ticket", "🎫") + " Velo Studio • Tickets")
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
