const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Muestra el avatar de un usuario.")
    .addUserOption(o =>
      o.setName("usuario")
       .setDescription("Usuario")
       .setRequired(false)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("usuario") || interaction.user;

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(`Avatar de ${user.username}`)
      .setImage(user.displayAvatarURL({ size: 1024 }))
      .setURL(user.displayAvatarURL({ size: 1024 }));

    await interaction.reply({ embeds: [embed] });
  }
};
