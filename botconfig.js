"use strict";

const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");
const config = require("./config");
const { getGuildSettings, updateGuildSettings } = require("./guild-settings");

const RISKY_ROLE_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageWebhooks
];

const data = new SlashCommandBuilder()
  .setName("botconfig")
  .setDescription("Configura los módulos integrados del bot desde Discord.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand(s => s
    .setName("estado")
    .setDescription("Muestra la configuración actual de este servidor."))
  .addSubcommand(s => s
    .setName("bienvenida")
    .setDescription("Define el canal de bienvenida y despedida.")
    .addChannelOption(o => o
      .setName("canal")
      .setDescription("Canal de texto donde publicar las entradas y salidas.")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true)))
  .addSubcommand(s => s
    .setName("bienvenida-off")
    .setDescription("Desactiva los mensajes de bienvenida y despedida."))
  .addSubcommand(s => s
    .setName("registros")
    .setDescription("Define el canal de registros del servidor.")
    .addChannelOption(o => o
      .setName("canal")
      .setDescription("Canal de texto privado para el equipo.")
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true)))
  .addSubcommand(s => s
    .setName("autorole")
    .setDescription("Asigna automáticamente un rol seguro a los nuevos miembros.")
    .addRoleOption(o => o
      .setName("rol")
      .setDescription("Rol básico que recibirán los nuevos miembros.")
      .setRequired(true)))
  .addSubcommand(s => s
    .setName("autorole-off")
    .setDescription("Desactiva el rol automático."))
  .addSubcommand(s => s
    .setName("automod")
    .setDescription("Activa o desactiva el AutoMod integrado.")
    .addBooleanOption(o => o
      .setName("activo")
      .setDescription("Indica si AutoMod debe estar activo en este servidor.")
      .setRequired(true)))
  .addSubcommand(s => s
    .setName("auditoria")
    .setDescription("Activa o desactiva los registros de acciones.")
    .addBooleanOption(o => o
      .setName("activo")
      .setDescription("Indica si se deben registrar eventos en el canal configurado.")
      .setRequired(true)));

function canConfigure(interaction) {
  const permissions = interaction.memberPermissions;
  return Boolean(permissions &&
    (permissions.has(PermissionFlagsBits.Administrator) ||
     permissions.has(PermissionFlagsBits.ManageGuild)));
}

function checkChannel(channel, guild) {
  if (!channel || !channel.isTextBased()) return "Selecciona un canal de texto válido.";
  const me = guild.members.me;
  if (!me) return "No pude comprobar los permisos del bot en este servidor.";
  const permissions = channel.permissionsFor(me);
  if (!permissions?.has(PermissionFlagsBits.ViewChannel) ||
      !permissions?.has(PermissionFlagsBits.SendMessages) ||
      !permissions?.has(PermissionFlagsBits.EmbedLinks)) {
    return "Necesito Ver canal, Enviar mensajes e Insertar enlaces en " + channel.toString() + ".";
  }
  return null;
}

function buildStatusEmbed(guild, settings) {
  const fallbackLogs = guild.id === config.guildId ? config.channels.logs : null;
  const welcomeId = settings.welcomeChannelId;
  const logsId = settings.logsChannelId || fallbackLogs;
  const autoModEnabled = settings.automodEnabled === null
    ? config.automod.enabled
    : settings.automodEnabled;

  return new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle("Centro de control del bot")
    .setDescription("Configuración guardada para " + guild.name.slice(0, 180) + ". Usa los subcomandos de /botconfig para editarla.")
    .addFields(
      { name: "Bienvenida y despedida", value: welcomeId ? "<#" + welcomeId + ">" : "No configurado", inline: true },
      { name: "Registros", value: logsId ? "<#" + logsId + ">" : "No configurado", inline: true },
      { name: "Rol automático", value: settings.autoroleId ? "<@&" + settings.autoroleId + ">" : "Desactivado", inline: true },
      { name: "AutoMod", value: autoModEnabled ? "Activo" : "Desactivado", inline: true },
      { name: "Auditoría", value: settings.auditEnabled ? "Activa" : "Desactivada", inline: true },
      { name: "Módulos integrados", value: "Moderación · Tickets · Tienda · Sorteos · Encuestas · Sugerencias · Utilidades", inline: false }
    )
    .setFooter({ text: "DATASHOP / Velo • Ajustes por servidor" })
    .setTimestamp();
}

module.exports = {
  data,
  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: "Este comando solo funciona dentro de un servidor.", ephemeral: true });
    }
    if (!canConfigure(interaction)) {
      return interaction.reply({
        content: "Necesitas el permiso Gestionar servidor o Administrador para configurar el bot.",
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();
    const guild = interaction.guild;

    try {
      if (subcommand === "estado") {
        return interaction.reply({
          embeds: [buildStatusEmbed(guild, getGuildSettings(guild.id))],
          ephemeral: true,
          allowedMentions: { parse: [] }
        });
      }

      if (subcommand === "bienvenida") {
        const channel = interaction.options.getChannel("canal", true);
        const problem = checkChannel(channel, guild);
        if (problem) return interaction.reply({ content: "No se pudo configurar: " + problem, ephemeral: true });
        updateGuildSettings(guild.id, { welcomeChannelId: channel.id });
        return interaction.reply({
          content: "Bienvenida y despedida configuradas en " + channel.toString() + ".",
          ephemeral: true,
          allowedMentions: { parse: [] }
        });
      }

      if (subcommand === "bienvenida-off") {
        updateGuildSettings(guild.id, { welcomeChannelId: null });
        return interaction.reply({ content: "Bienvenida y despedida desactivadas para este servidor.", ephemeral: true });
      }

      if (subcommand === "registros") {
        const channel = interaction.options.getChannel("canal", true);
        const problem = checkChannel(channel, guild);
        if (problem) return interaction.reply({ content: "No se pudo configurar: " + problem, ephemeral: true });
        updateGuildSettings(guild.id, { logsChannelId: channel.id });
        return interaction.reply({
          content: "Los registros se enviarán a " + channel.toString() + ".",
          ephemeral: true,
          allowedMentions: { parse: [] }
        });
      }

      if (subcommand === "autorole") {
        const role = interaction.options.getRole("rol", true);
        const me = guild.members.me;
        if (role.id === guild.id || role.managed) {
          return interaction.reply({ content: "Elige un rol asignable; no se puede usar @everyone ni roles gestionados por integraciones.", ephemeral: true });
        }
        if (role.permissions.any(RISKY_ROLE_PERMISSIONS)) {
          return interaction.reply({
            content: "Por seguridad, el autorol no puede tener permisos administrativos, de moderación ni de gestión.",
            ephemeral: true
          });
        }
        if (!me?.permissions.has(PermissionFlagsBits.ManageRoles) || role.position >= me.roles.highest.position) {
          return interaction.reply({
            content: "Necesito Gestionar roles y mi rol más alto debe estar por encima de " + role.toString() + ".",
            ephemeral: true,
            allowedMentions: { parse: [] }
          });
        }
        updateGuildSettings(guild.id, { autoroleId: role.id });
        return interaction.reply({
          content: "Autorol configurado: los nuevos miembros recibirán " + role.toString() + ".",
          ephemeral: true,
          allowedMentions: { parse: [] }
        });
      }

      if (subcommand === "autorole-off") {
        updateGuildSettings(guild.id, { autoroleId: null });
        return interaction.reply({ content: "Autorol desactivado.", ephemeral: true });
      }

      if (subcommand === "automod") {
        const enabled = interaction.options.getBoolean("activo", true);
        updateGuildSettings(guild.id, { automodEnabled: enabled });
        return interaction.reply({
          content: enabled ? "AutoMod activado para este servidor." : "AutoMod desactivado para este servidor.",
          ephemeral: true
        });
      }

      if (subcommand === "auditoria") {
        const enabled = interaction.options.getBoolean("activo", true);
        updateGuildSettings(guild.id, { auditEnabled: enabled });
        return interaction.reply({
          content: enabled ? "Auditoría activada." : "Auditoría desactivada.",
          ephemeral: true
        });
      }

      return interaction.reply({ content: "Subcomando de configuración desconocido.", ephemeral: true });
    } catch (error) {
      console.error("Error en /botconfig:", error);
      const response = { content: "No se pudo guardar la configuración. Revisa los permisos y el almacenamiento del hosting.", ephemeral: true };
      if (interaction.replied || interaction.deferred) return interaction.followUp(response).catch(() => {});
      return interaction.reply(response).catch(() => {});
    }
  }
};
