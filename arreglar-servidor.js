"use strict";

const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");
const config = require("./config");
const { hasPermission, hasConfiguredRole } = require("./utils/permissions");

const BASE_LAYOUT = [
  {
    categoryName: "📌・INFORMACIÓN",
    categoryMatch: /informacion|\binfo\b|general/i,
    channels: [
      { name: "📜・terminos", match: /reglas|normas|terminos|condiciones|\bterms\b|\brules\b/i, configuredId: () => config.channels.terms },
      { name: "💳・metodos-de-pago", match: /metodos.*pago|pagos|payment|payments/i, configuredId: () => config.channels.paymentMethods }
    ]
  },
  {
    categoryName: "🛍️・TIENDA",
    categoryMatch: /\btienda\b|\bstore\b|catalogo/i,
    channels: [
      { name: "🛒・catalogo", match: /catalogo|productos|products|\bshop\b/i },
      { name: "📢・anuncios", match: /anuncios?|novedades|news|actualizaciones/i, configuredId: () => config.channels.announcements },
      { name: "✅・vouches", match: /vouches?|legit|resenas?|reviews|opiniones/i, configuredId: () => config.channels.reviews }
    ]
  },
  {
    categoryName: "🎫・SOPORTE",
    categoryMatch: /soporte|support|atencion|customer-support/i,
    channels: [
      { name: "🎫・abrir-ticket", match: /abrir.?ticket|ticket.?panel|tickets?|ayuda|support/i }
    ]
  }
];

function normalizeName(value) {
  return String(value || "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function hasStaffAccess(i) {
  return hasPermission(i.member, PermissionFlagsBits.Administrator) ||
    hasPermission(i.member, PermissionFlagsBits.ManageGuild) ||
    hasConfiguredRole(i.member, [config.roles.admin]);
}

function clip(lines, limit = 1000) {
  const value = lines.length ? lines.map((line, index) => (index + 1) + ". " + line).join("\n") : "Ninguno.";
  return value.length > limit ? value.slice(0, limit - 3) + "..." : value;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("arreglar-servidor")
    .setDescription("Revisa el servidor y crea canales base faltantes sin borrar ni cambiar permisos.")
    .addStringOption(option => option
      .setName("accion")
      .setDescription("Revisar sin cambios o crear los canales base que falten")
      .setRequired(true)
      .addChoices(
        { name: "Revisar solamente", value: "revisar" },
        { name: "Crear canales base faltantes", value: "crear-base" }
      )),

  async execute(i) {
    if (!i.guild) {
      return i.reply({ content: "Este comando solo funciona dentro de un servidor.", ephemeral: true });
    }
    if (!hasStaffAccess(i)) {
      return i.reply({ content: "Solo la administración puede ejecutar esta reparación.", ephemeral: true });
    }

    const guild = i.guild;
    const action = i.options.getString("accion");
    const botMember = guild.members.me;
    if (action === "crear-base" && !botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return i.reply({
        content: "No puedo crear canales porque me falta el permiso **Gestionar canales**. No cambié nada.",
        ephemeral: true
      });
    }

    await i.deferReply({ ephemeral: true });
    await Promise.all([
      guild.channels.fetch().catch(() => null),
      guild.roles.fetch().catch(() => null)
    ]);

    const created = [];
    const errors = [];
    const existing = [];
    const missingBefore = [];
    const allText = () => [...guild.channels.cache.values()].filter(channel =>
      [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum].includes(channel.type)
    );
    const allCategories = () => [...guild.channels.cache.values()].filter(channel =>
      channel.type === ChannelType.GuildCategory
    );

    for (const group of BASE_LAYOUT) {
      const groupChannelsMissing = group.channels.filter(item => {
        const configuredId = typeof item.configuredId === "function" ? item.configuredId() : null;
        const foundById = configuredId && guild.channels.cache.has(configuredId);
        const foundByName = allText().some(channel => item.match.test(normalizeName(channel.name)));
        return !foundById && !foundByName;
      });

      for (const item of group.channels) {
        const configuredId = typeof item.configuredId === "function" ? item.configuredId() : null;
        const found = (configuredId && guild.channels.cache.get(configuredId)) ||
          allText().find(channel => item.match.test(normalizeName(channel.name)));
        if (found) existing.push("#" + found.name + " ya cubre esa función.");
        else missingBefore.push(item.name);
      }

      if (action !== "crear-base" || groupChannelsMissing.length === 0) continue;

      let category = allCategories().find(channel => group.categoryMatch.test(normalizeName(channel.name)));
      if (!category) {
        try {
          category = await guild.channels.create({
            name: group.categoryName,
            type: ChannelType.GuildCategory,
            reason: "Reparación solicitada por la administración de FLUX STORE"
          });
          created.push("Categoría " + category.name);
        } catch (error) {
          errors.push("No pude crear la categoría " + group.categoryName + ": " + String(error.message || error).slice(0, 160));
          continue;
        }
      }

      for (const item of groupChannelsMissing) {
        try {
          // Only create missing public text channels. Existing channels/overwrites are never modified.
          const channel = await guild.channels.create({
            name: item.name,
            type: ChannelType.GuildText,
            parent: category.id,
            reason: "Canal base faltante solicitado mediante /arreglar-servidor"
          });
          created.push("#" + channel.name + " dentro de " + category.name);
        } catch (error) {
          errors.push("No pude crear " + item.name + ": " + String(error.message || error).slice(0, 160));
        }
      }
    }

    const riskyRoles = [...guild.roles.cache.values()]
      .filter(role => role.id !== guild.id && !role.managed && role.permissions.has(PermissionFlagsBits.Administrator))
      .map(role => role.name)
      .slice(0, 8);
    const visibleSensitiveChannels = allText().filter(channel =>
      /ticket|staff|admin|mod|logs?|transacciones|compras|postulaciones/i.test(channel.name) &&
      channel.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel)
    ).map(channel => "#" + channel.name).slice(0, 8);

    const summary = new EmbedBuilder()
      .setColor(errors.length || riskyRoles.length || visibleSensitiveChannels.length ? (config.colors.warning || 0xF59E0B) : (config.colors.success || 0x22C55E))
      .setTitle("FLUX STORE • Reparador de servidor")
      .setDescription(action === "crear-base"
        ? "Terminé la pasada de creación. Solo añadí canales base que no encontré; no borré, moví ni renombré nada."
        : "Revisión completada en modo seguro. Para crear los canales faltantes, vuelve a ejecutar con **Crear canales base faltantes**.")
      .addFields(
        { name: "Canales base ya existentes", value: clip(existing), inline: false },
        { name: action === "crear-base" ? "Cambios realizados" : "Canales detectados como faltantes", value: clip(action === "crear-base" ? created : missingBefore), inline: false },
        { name: "Roles con Administrador (revisión manual)", value: clip(riskyRoles), inline: false },
        { name: "Canales que parecen privados y son visibles para @everyone", value: clip(visibleSensitiveChannels), inline: false },
        { name: "Errores", value: clip(errors), inline: false }
      )
      .setFooter({ text: "No se modifican permisos de roles ni canales existentes. Revisa los permisos detectados manualmente." })
      .setTimestamp();

    return i.editReply({ embeds: [summary], allowedMentions: { parse: [] } });
  }
};
