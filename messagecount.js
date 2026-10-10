const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { emoji } = require("./ui");
const config = require("./config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("messagecount")
    .setDescription("Consulta el contador de mensajes del bot desde su último reinicio.")
    .addUserOption(option => option.setName("usuario").setDescription("Usuario que quieres consultar").setRequired(false)),
  async execute(interaction, client) {
    const user = interaction.options.getUser("usuario") || interaction.user;
    const key = interaction.guildId + ":" + user.id;
    const count = client.messageCounts?.get(key) || 0;
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(emoji(interaction.guild, "info", "💬") + " Contador de mensajes")
      .setDescription(user + " ha enviado **" + count + "** mensajes desde el último reinicio del bot.")
      .setFooter({ text: "El contador se reinicia cuando el bot se reinicia." });
    return interaction.reply({ embeds: [embed] });
  }
};
