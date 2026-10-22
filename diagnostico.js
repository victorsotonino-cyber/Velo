const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");
const config = require("./config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("diagnostico")
    .setDescription("Comprueba la configuración y los permisos de FLUX STORE.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: "Este comando solo funciona dentro de un servidor.", ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const guild = interaction.guild;
    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const checks = [];
    const add = (ok, label, detail) => checks.push({ ok: Boolean(ok), label, detail });

    const checkChannel = (id, label, allowedTypes = null) => {
      if (!id) {
        add(false, label, "No hay ID configurado.");
        return null;
      }
      const channel = guild.channels.cache.get(String(id));
      const valid = Boolean(channel && (!allowedTypes || allowedTypes.includes(channel.type)));
      add(valid, label, valid ? channel.toString() : "No existe, no está accesible o tiene un tipo incorrecto.");
      return valid ? channel : null;
    };

    const checkRole = (id, label) => {
      if (!id) {
        add(false, label, "No hay ID configurado.");
        return null;
      }
      const role = guild.roles.cache.get(String(id));
      add(Boolean(role), label, role ? role.toString() : "El rol no existe en este servidor.");
      return role || null;
    };

    checkChannel(config.channels.welcome, "Canal de bienvenida", [ChannelType.GuildText, ChannelType.GuildAnnouncement]);
    checkChannel(config.channels.logs, "Canal de registros", [ChannelType.GuildText]);
    const ticketCategory = checkChannel(config.channels.tickets, "Categoría de tickets", [ChannelType.GuildCategory]);
    checkChannel(config.channels.announcements, "Canal de anuncios", [ChannelType.GuildText, ChannelType.GuildAnnouncement]);

    const adminRole = checkRole(config.roles.admin, "Rol de administración");
    const staffRole = checkRole(config.roles.staff, "Rol de Staff");
    checkRole(config.roles.member, "Rol automático de miembro");

    const requiredBotPermissions = [
      [PermissionFlagsBits.ViewChannel, "Ver canales"],
      [PermissionFlagsBits.SendMessages, "Enviar mensajes"],
      [PermissionFlagsBits.EmbedLinks, "Insertar enlaces y embeds"],
      [PermissionFlagsBits.ReadMessageHistory, "Leer historial"],
      [PermissionFlagsBits.ManageChannels, "Gestionar canales"]
    ];

    if (!me) {
      add(false, "Miembro del bot", "No pude obtener el miembro del bot en este servidor.");
    } else {
      for (const [permission, label] of requiredBotPermissions) {
        add(me.permissions.has(permission), "Permiso del bot: " + label,
          me.permissions.has(permission) ? "Disponible" : "Falta este permiso.");
      }
      add(me.permissions.has(PermissionFlagsBits.ManageRoles), "Permiso del bot: Gestionar roles",
        me.permissions.has(PermissionFlagsBits.ManageRoles) ? "Disponible" : "Necesario para asignar roles automáticamente.");
      if (adminRole) {
        add(me.roles.highest.position > adminRole.position, "Jerarquía sobre el rol de administración",
          me.roles.highest.position > adminRole.position ? "El rol más alto del bot está por encima." : "Sube el rol del bot por encima del rol de administración.");
      }
      if (staffRole) {
        add(me.roles.highest.position > staffRole.position, "Jerarquía sobre el rol de Staff",
          me.roles.highest.position > staffRole.position ? "El rol más alto del bot está por encima." : "Sube el rol del bot por encima del rol de Staff.");
      }
    }

    const categoryEntries = Object.entries(config.ticket.categories || {});
    add(categoryEntries.length > 0, "Categorías de tickets", categoryEntries.length + " configuradas.");
    for (const [key, category] of categoryEntries) {
      const emojiExists = category.emojiId && guild.emojis.cache.has(String(category.emojiId));
      add(Boolean(category.label), "Categoría: " + key, category.label ? category.label : "Falta el nombre visible.");
      if (category.emojiId) {
        add(Boolean(emojiExists), "Emoji de " + key,
          emojiExists ? "Emoji personalizado disponible." : "El emoji no está en este servidor; se usará el respaldo configurado.");
      }
    }

    add(Number.isInteger(config.ticket.maxOpenPerUser) && config.ticket.maxOpenPerUser >= 1,
      "Límite de tickets por usuario", String(config.ticket.maxOpenPerUser));
    add(Boolean(config.clientId), "CLIENT_ID", config.clientId ? "Configurado." : "Falta en las variables de entorno.");
    add(Boolean(config.guildId), "GUILD_ID", config.guildId ? "Configurado." : "Falta en las variables de entorno.");
    add(Boolean(config.token), "DISCORD_TOKEN", config.token ? "Configurado (valor oculto)." : "Falta en las variables de entorno.");

    if (ticketCategory && me) {
      const visible = ticketCategory.permissionsFor(me)?.has(PermissionFlagsBits.ViewChannel);
      add(Boolean(visible), "Acceso del bot a la categoría de tickets",
        visible ? "El bot puede ver la categoría." : "Revisa los permisos de la categoría.");
    }

    const passed = checks.filter(c => c.ok).length;
    const failed = checks.length - passed;
    const lines = checks.map(c => (c.ok ? "✅" : "❌") + " **" + c.label + "** — " + c.detail);
    const embed = new EmbedBuilder()
      .setColor(failed === 0 ? (config.colors.success || 0x22C55E) : (config.colors.warning || 0xF59E0B))
      .setTitle("FLUX STORE • Diagnóstico del bot")
      .setDescription(lines.join("\n").slice(0, 4000))
      .addFields(
        { name: "Comprobaciones correctas", value: String(passed), inline: true },
        { name: "Revisar", value: String(failed), inline: true }
      )
      .setFooter({ text: "Diagnóstico automático • No muestra secretos ni tokens" })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
