const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
const { emoji } = require("./ui");

module.exports = {
  data: new SlashCommandBuilder().setName("ping").setDescription("Muestra la latencia."),
  async execute(i) {
    const ms = Date.now() - i.createdTimestamp;
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(emoji(i.guild, "bot", "🏓") + " Pong")
      .setDescription("Latencia del bot: **" + ms + "ms**\nAPI: **" + i.client.ws.ping + "ms**");
    await i.reply({ embeds: [embed] });
  }
};
