const {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType
} = require("discord.js");
const config = require("./config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("verificacion-panel")
    .setDescription("Publica un panel de verificación con captcha para nuevos miembros.")
    .addChannelOption(o => o.setName("canal").setDescription("Canal donde publicar el panel").addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addRoleOption(o => o.setName("rol_verificado").setDescription("Rol que se entregará tras verificar").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: "Usa este comando dentro de un servidor.", ephemeral: true });
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: "Necesitas Gestionar servidor para publicar el panel.", ephemeral: true });
    }
    const channel = interaction.options.getChannel("canal", true);
    const role = interaction.options.getRole("rol_verificado", true);
    const botMember = interaction.guild.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ content: "Necesito el permiso **Gestionar roles**.", ephemeral: true });
    }
    if (role.position >= botMember.roles.highest.position) {
      return interaction.reply({ content: "El rol que elegiste debe estar por debajo del rol más alto del bot.", ephemeral: true });
    }
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle("🔐 Verificación de miembros")
      .setDescription("¡Bienvenido/a! Para acceder al servidor, pulsa el botón y resuelve una pequeña operación de comprobación.\n\n**No compartas contraseñas ni códigos de acceso.**")
      .setFooter({ text: "Verificación de seguridad • NOVYZ Market" });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("gift_verify_start:" + role.id).setLabel("Verificarme").setEmoji("✅").setStyle(ButtonStyle.Success)
    );
    await channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: "Panel de verificación publicado en " + channel + ". Rol que se entregará: " + role + ".", ephemeral: true });
  }
};
