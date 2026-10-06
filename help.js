const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const config = require("./config");
const { emoji, emojiData } = require("./ui");

module.exports = {
  data: new SlashCommandBuilder().setName("help").setDescription("Muestra la ayuda."),
  async execute(i) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("help_category")
      .setPlaceholder("Selecciona una categoría")
      .addOptions(
        { label: "Utilidad", value: "utilidad", emoji: emojiData(i.guild, "info", "🧰") },
        { label: "Moderación", value: "moderacion", emoji: emojiData(i.guild, "moderation", "🛡️") },
        { label: "Tickets", value: "tickets", emoji: emojiData(i.guild, "ticket", "🎫") },
        { label: "Servidor", value: "servidor", emoji: emojiData(i.guild, "channel", "🏠") },
        { label: "Diversión", value: "diversion", emoji: emojiData(i.guild, "fun", "🎮") },
        { label: "Configuración", value: "configuracion", emoji: emojiData(i.guild, "settings", "⚙️") }
      );

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(emoji(i.guild, "brand", "✨") + " Velo Studio — Ayuda")
      .setDescription("Elige una categoría para ver los comandos disponibles.")
      .setFooter({ text: "Usa /anuncio para generar anuncios automáticamente." });

    await i.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu)]
    });
  }
};
