const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Muestra información del servidor."),

  async execute(interaction) {
    const guild = interaction.guild;

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`📊 ${guild.name}`)
      .addFields(
        { name: "👥 Miembros", value: `${guild.memberCount}`, inline: true },
        { name: "💬 Canales", value: `${guild.channels.cache.size}`, inline: true },
        { name: "🎭 Roles", value: `${guild.roles.cache.size}`, inline: true },
        { name: "🆔 ID", value: guild.id }
      )
      .setThumbnail(guild.iconURL({ size: 512 }) || null);

    await interaction.reply({ embeds: [embed] });
  }
};
