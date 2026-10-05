const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket-config")
    .setDescription("Consulta la configuración base del sistema de tickets.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(interaction) {
    await interaction.reply({
      ephemeral: true,
      content:
        `🎫 **Configuración Velo Studio**\n` +
        `📁 Categoría principal: <#${config.channels.tickets}>\n` +
        `🛡️ Staff: <@&${config.roles.staff}>\n` +
        `🔴 Color: #E11D2E\n\n` +
        `Usa **/ticket-edit** para administrar categorías, canales y permisos.`
    });
  }
};
