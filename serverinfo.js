const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
const { emoji } = require("./ui");

module.exports = {
  data: new SlashCommandBuilder().setName("serverinfo").setDescription("Muestra información del servidor."),
  async execute(i) {
    const g = i.guild;
    const e = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(emoji(i.guild, "channel", "🏠") + " " + g.name)
      .addFields(
        { name: emoji(i.guild, "users", "👥") + " Miembros", value: String(g.memberCount), inline: true },
        { name: emoji(i.guild, "channel", "📁") + " Canales", value: String(g.channels.cache.size), inline: true },
        { name: "🆔 ID", value: g.id, inline: true }
      )
      .setThumbnail(g.iconURL({ size: 256 }))
      .setFooter({ text: "Velo Studio" })
      .setTimestamp();
    await i.reply({ embeds: [e] });
  }
};
