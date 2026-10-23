"use strict";
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");
const config = require("./config");
const { hasPermission, hasConfiguredRole } = require("./utils/permissions");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("analizar-servidor")
    .setDescription("Analiza canales, roles y permisos y recomienda mejoras para el servidor."),
  async execute(i) {
    if (!i.guild) {
      return i.reply({ content: "Este comando solo funciona dentro de un servidor.", ephemeral: true });
    }

    const allowed =
      hasPermission(i.member, PermissionFlagsBits.Administrator) ||
      hasPermission(i.member, PermissionFlagsBits.ManageGuild) ||
      hasConfiguredRole(i.member, [config.roles.admin]);

    if (!allowed) {
      return i.reply({ content: "Solo la administración puede ejecutar el análisis del servidor.", ephemeral: true });
    }

    await i.deferReply({ ephemeral: true });
    const guild = i.guild;
    await Promise.all([
      guild.channels.fetch().catch(() => null),
      guild.roles.fetch().catch(() => null)
    ]);

    const channels = [...guild.channels.cache.values()];
    const roles = [...guild.roles.cache.values()];
    const categories = channels.filter(c => c.type === ChannelType.GuildCategory);
    const textChannels = channels.filter(c =>
      [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum].includes(c.type)
    );
    const voiceChannels = channels.filter(c =>
      [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(c.type)
    );
    const everyone = guild.roles.everyone;
    const findings = [];
    const recommendations = [];

    const nameCounts = new Map();
    for (const channel of channels) {
      const normalized = channel.name.toLowerCase().replace(/[ _-]+/g, "");
      nameCounts.set(normalized, (nameCounts.get(normalized) || 0) + 1);
    }
    const duplicateChannels = channels.filter(c => nameCounts.get(c.name.toLowerCase().replace(/[ _-]+/g, "")) > 1);
    if (duplicateChannels.length) {
      findings.push("Hay nombres de canales repetidos o casi idénticos: " +
        [...new Set(duplicateChannels.map(c => "#" + c.name))].slice(0, 6).join(", "));
      recommendations.push("Renombra o agrupa los canales repetidos para que cada uno tenga una función clara.");
    }

    const emptyCategories = categories.filter(cat =>
      !channels.some(c => c.parentId === cat.id)
    );
    if (emptyCategories.length) {
      findings.push("Categorías vacías: " + emptyCategories.slice(0, 5).map(c => c.name).join(", "));
      recommendations.push("Elimina las categorías vacías o crea dentro de ellas los canales previstos.");
    }

    const adminRoles = roles.filter(r => !r.managed && r.id !== guild.id && r.permissions.has(PermissionFlagsBits.Administrator));
    if (adminRoles.length) {
      findings.push("Roles con permiso de Administrador: " + adminRoles.slice(0, 8).map(r => r.name).join(", "));
      recommendations.push("Limita Administrador a personas de máxima confianza; usa permisos específicos para el resto del staff.");
    }

    const everyoneDangerous = [
      [PermissionFlagsBits.Administrator, "Administrador"],
      [PermissionFlagsBits.ManageGuild, "Gestionar servidor"],
      [PermissionFlagsBits.ManageRoles, "Gestionar roles"],
      [PermissionFlagsBits.ManageChannels, "Gestionar canales"],
      [PermissionFlagsBits.BanMembers, "Banear miembros"],
      [PermissionFlagsBits.KickMembers, "Expulsar miembros"],
      [PermissionFlagsBits.MentionEveryone, "Mencionar @everyone/@here"]
    ].filter(([bit]) => everyone.permissions.has(bit)).map(([, name]) => name);
    if (everyoneDangerous.length) {
      findings.push("@everyone tiene permisos sensibles: " + everyoneDangerous.join(", "));
      recommendations.push("Revisa los permisos del rol @everyone y deja la moderación y administración solo a los roles correspondientes.");
    }

    const publicPrivateNames = channels.filter(c =>
      /ticket|staff|admin|mod(eraci[oó]n)?|logs?|transacciones|compras|postulaciones/i.test(c.name) &&
      c.isTextBased?.() &&
      c.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel)
    );
    if (publicPrivateNames.length) {
      findings.push("Canales que parecen privados pero @everyone puede ver: " +
        publicPrivateNames.slice(0, 8).map(c => "#" + c.name).join(", "));
      recommendations.push("Confirma los permisos de los canales de staff, logs y tickets. Si deben ser privados, desactiva Ver canal para @everyone y concede acceso a los roles adecuados.");
    }

    const highPositionRoles = roles.filter(r =>
      !r.managed && r.id !== guild.id && r.position >= guild.members.me?.roles.highest.position
    );
    if (highPositionRoles.length && guild.members.me) {
      findings.push("Hay roles por encima o al nivel del rol más alto del bot: " +
        highPositionRoles.slice(0, 6).map(r => r.name).join(", "));
      recommendations.push("Coloca el rol del bot por encima de los roles que deba administrar; Discord no permite gestionar roles iguales o superiores.");
    }

    const suspiciousRoleNames = roles.filter(r =>
      !r.managed && r.id !== guild.id && /admin|owner|moder|staff|support|soporte/i.test(r.name)
    );
    if (suspiciousRoleNames.length > 1) {
      recommendations.push("Revisa la jerarquía y las responsabilidades de los roles de equipo: " +
        suspiciousRoleNames.slice(0, 8).map(r => r.name).join(", ") + ".");
    }

    if (textChannels.length < 5) {
      recommendations.push("Para una tienda, considera separar información, catálogo, anuncios, soporte/tickets y reseñas o vouches, si todavía no existen.");
    }
    if (!channels.some(c => /reglas|normas|terminos|términos/i.test(c.name))) {
      recommendations.push("Añade o identifica un canal visible de reglas y condiciones de compra para que los clientes sepan cómo funciona la tienda.");
    }
    if (!channels.some(c => /vouch|reseñas|reviews|opiniones|ventas/i.test(c.name))) {
      recommendations.push("Considera un canal de reseñas/vouches para mostrar el historial de ventas sin exponer datos privados.");
    }
    if (!channels.some(c => /ticket|soporte|ayuda/i.test(c.name))) {
      recommendations.push("Añade un punto claro de soporte o tickets para que los clientes puedan pedir ayuda.");
    }

    if (!findings.length) {
      findings.push("No se detectaron los problemas básicos comprobados en esta revisión automática.");
    }
    if (!recommendations.length) {
      recommendations.push("Mantén la estructura documentada y revisa periódicamente los permisos después de añadir canales o roles.");
    }

    const severity = findings.some(f => /Administrador|permisos sensibles|@everyone|puede ver/i.test(f)) ? 0xEF4444 : 0xF59E0B;
    const clip = (items, limit = 950) => {
      const text = items.map((item, idx) => (idx + 1) + ". " + item).join("\n");
      return text.length > limit ? text.slice(0, limit - 3) + "..." : text;
    };
    const embed = new EmbedBuilder()
      .setColor(severity)
      .setTitle("FLUX STORE • Análisis del servidor")
      .setDescription("Revisión automática de la estructura visible para el bot. Las recomendaciones requieren confirmación humana antes de cambiar permisos.")
      .addFields(
        { name: "Resumen", value: [
          "Miembros: **" + guild.memberCount + "**",
          "Categorías: **" + categories.length + "**",
          "Canales de texto/foros: **" + textChannels.length + "**",
          "Canales de voz: **" + voiceChannels.length + "**",
          "Roles (incluye @everyone): **" + roles.length + "**"
        ].join("\n"), inline: true },
        { name: "Hallazgos", value: clip(findings), inline: false },
        { name: "Mejoras recomendadas", value: clip(recommendations), inline: false }
      )
      .setFooter({ text: "Análisis orientativo • No modifica canales, roles ni permisos" })
      .setTimestamp();

    return i.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
