const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Comprueba la velocidad del bot."),

  async execute(interaction) {
    const ping = Date.now() - interaction.createdTimestamp;

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle("🏓 Velo Studio")
      .setDescription(`Pong! ⚡\nLatencia: **${ping}ms**\nAPI: **${interaction.client.ws.ping}ms**`);

    await interaction.reply({ embeds: [embed] });
  }
};
