const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
const { emoji } = require("./ui");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Muestra un avatar.")
    .addUserOption(o => o.setName("usuario").setDescription("Usuario").setRequired(false)),
  async execute(i) {
    const u = i.options.getUser("usuario") || i.user;
    const title = emoji(i.guild, "users", "👤") + " Avatar de " + u.username;
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(title)
      .setImage(u.displayAvatarURL({ size: 1024, extension: "png" }))
      .setFooter({ text: "Velo Studio" });
    await i.reply({ embeds: [embed] });
  }
};
