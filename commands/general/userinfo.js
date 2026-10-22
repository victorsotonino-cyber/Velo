const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Muestra información de un usuario del servidor.")
    .addUserOption(option => option.setName("usuario").setDescription("Usuario que quieres consultar").setRequired(false)),
  async execute(interaction) {
    const user = interaction.options.getUser("usuario") || interaction.user;
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const roles = member
      ? member.roles.cache.filter(role => role.id !== interaction.guildId)
        .sort((a, b) => b.position - a.position)
        .map(role => role.toString()).slice(0, 15).join(" ")
      : "No es miembro de este servidor.";
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle("Información de usuario • " + user.tag)
      .setThumbnail(user.displayAvatarURL({ size: 512 }))
      .addFields(
        { name: "ID", value: user.id, inline: true },
        { name: "Bot", value: user.bot ? "Sí" : "No", inline: true },
        { name: "Cuenta creada", value: "<t:" + Math.floor(user.createdTimestamp / 1000) + ":F>", inline: false },
        { name: "Se unió al servidor", value: member?.joinedTimestamp ? "<t:" + Math.floor(member.joinedTimestamp / 1000) + ":F>" : "No disponible", inline: false },
        { name: "Roles", value: (roles || "Sin roles adicionales").slice(0, 1024), inline: false }
      )
      .setFooter({ text: "FLUX STORE • User Info" });
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
