"use strict";
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const config = require("./config");
const { hasPermission, hasConfiguredRole } = require("./utils/permissions");
const { readJSON } = require("./storage");
module.exports = {
  data: new SlashCommandBuilder().setName("diagnostico").setDescription("Revisa los ajustes del bot en este servidor sin revelar secretos."),
  async execute(i, client) {
    if (!i.guild) return i.reply({ content: "Este comando solo funciona en un servidor.", ephemeral: true });
    const isAllowed = hasPermission(i.member, PermissionFlagsBits.Administrator) ||
      hasPermission(i.member, PermissionFlagsBits.ManageGuild) ||
      hasConfiguredRole(i.member, [config.roles.admin]);
    if (!isAllowed) return i.reply({ content: "Solo administración puede revisar la configuración del bot.", ephemeral: true });

    const saved = readJSON("ticket-config.json", {})[i.guild.id] || {};
    const data = [
      ["Token configurado", Boolean(String(config.token || "").trim())],
      ["CLIENT_ID", Boolean(config.clientId)],
      ["GUILD_ID", Boolean(config.guildId)],
      ["Canal de logs", Boolean(config.channels.logs)],
      ["Categoría base de tickets", Boolean(config.channels.tickets)],
      ["Rol administrador", Boolean(config.roles.admin)],
      ["Rol staff", Boolean(config.roles.staff)],
      ["Panel guardado para este servidor", Boolean(saved.panelMessageId && saved.publishedPanelChannelId)],
      ["Canal público guardado", Boolean(saved.panelChannelId && i.guild.channels.cache.has(saved.panelChannelId))],
      ["Categoría para tickets guardada", Boolean(saved.ticketCategoryId && i.guild.channels.cache.get(saved.ticketCategoryId)?.type === ChannelType.GuildCategory)],
      ["Rol de soporte guardado", Array.isArray(saved.supportRoleIds) && saved.supportRoleIds.some(id => i.guild.roles.cache.has(id))],
      ["Gateway conectado", Boolean(client.isReady())]
    ];
    const description = data.map(([label, ok]) => (ok ? "✅" : "⚠️") + " **" + label + ":** " + (ok ? "configurado" : "pendiente")).join("\n");
    const perms = i.channel.permissionsFor(i.guild.members.me);
    const channelCheck = [
      [PermissionFlagsBits.ViewChannel, "Ver canal"],
      [PermissionFlagsBits.SendMessages, "Enviar mensajes"],
      [PermissionFlagsBits.EmbedLinks, "Insertar enlaces"],
      [PermissionFlagsBits.ManageChannels, "Gestionar canales"]
    ];
    const missingPerms = channelCheck.filter(([bit]) => !perms?.has(bit)).map(([, label]) => label);
    const embed = new EmbedBuilder()
      .setColor(data.some(([, ok]) => !ok) || missingPerms.length ? (config.colors.warning || 0xF59E0B) : (config.colors.success || 0x22C55E))
      .setTitle("🔎 FLUX STORE • Diagnóstico")
      .setDescription(description)
      .addFields({
        name: "Permisos en este canal",
        value: missingPerms.length ? "Faltan: " + missingPerms.join(", ") : "✅ Permisos básicos de publicación disponibles.",
        inline: false
      })
      .setFooter({ text: "No se muestra el token ni el contenido de secretos. Un token presente no implica que sea válido." })
      .setTimestamp();
    return i.reply({ embeds: [embed], ephemeral: true, allowedMentions: { parse: [] } });
  }
};
