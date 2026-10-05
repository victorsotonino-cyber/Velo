const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require("discord.js");
const config = require("../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Muestra el centro de ayuda de Velo Studio."),

  async execute(interaction) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("help_category")
      .setPlaceholder("Selecciona una categoría")
      .addOptions(
        { label: "Utilidad", value: "utility", emoji: "🛠️" },
        { label: "Moderación", value: "moderation", emoji: "🛡️" },
        { label: "Tickets", value: "tickets", emoji: "🎫" },
        { label: "Servidor", value: "server", emoji: "📊" },
        { label: "Diversión", value: "fun", emoji: "🎮" },
        { label: "Configuración", value: "config", emoji: "⚙️" }
      );

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle("🤖 Velo Studio — Ayuda")
      .setDescription("Selecciona una categoría para ver sus comandos.")
      .setFooter({ text: "Velo Studio" });

    await interaction.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu)]
    });
  }
};
