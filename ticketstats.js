"use strict";
const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require("discord.js");
const config = require("./config");
const { getTicketStats } = require("./utils/command-helpers");
const { hasPermission, hasConfiguredRole } = require("./utils/permissions");
module.exports = {
  data: new SlashCommandBuilder().setName("ticketstats").setDescription("Muestra las estadísticas de los tickets que siguen abiertos.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(i) {
    if (!i.guild) return i.reply({ content: "Este comando solo funciona en un servidor.", ephemeral: true });
    const allowed = hasPermission(i.member, PermissionFlagsBits.ManageChannels) ||
      hasConfiguredRole(i.member, [config.roles.admin, config.roles.staff]);
    if (!allowed) return i.reply({ content: "Necesitas Gestionar canales o un rol de administración/staff configurado para ver estas estadísticas.", ephemeral: true });
    const channels = i.guild.channels.cache.filter(channel => channel.type === ChannelType.GuildText);
    const stats = getTicketStats(channels);
    const categoryLines = Object.entries(stats.categories).sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([key, count]) => "• " + key + ": " + count).join("\n") || "No hay tickets abiertos identificados.";
    const embed = new EmbedBuilder().setColor(config.colors.primary || 0x8B5CF6)
      .setTitle("🎫 FLUX STORE • Estadísticas de tickets")
      .addFields(
        { name: "Tickets abiertos", value: String(stats.total), inline: true },
        { name: "Clientes con ticket", value: String(stats.uniqueOwners), inline: true },
        { name: "Categorías", value: String(Object.keys(stats.categories).length), inline: true },
        { name: "Distribución", value: categoryLines.slice(0, 1024), inline: false }
      ).setFooter({ text: "Cuenta canales cuyo tema comienza con VeloTicket:; no incluye tickets cerrados." }).setTimestamp();
    return i.reply({ embeds: [embed], ephemeral: true, allowedMentions: { parse: [] } });
  }
};
