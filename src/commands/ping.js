const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder().setName("ping").setDescription("Comprueba la latencia de DATASHOP."),
  async execute(interaction, client) {
    const embed = new EmbedBuilder()
      .setColor(0x8B5CF6)
      .setTitle("🏓 DATASHOP | Pong")
      .setDescription(`Gateway: **${client.ws.ping} ms**\nRespuesta: **${Math.max(0, Date.now() - interaction.createdTimestamp)} ms**`)
      .setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};