"use strict";

const {
  Events,
  EmbedBuilder,
  PermissionFlagsBits
} = require("discord.js");
const config = require("./config");
const { getGuildSettings } = require("./guild-settings");

function configuredChannelId(guild, settings) {
  return settings.logsChannelId || (guild.id === config.guildId ? config.channels.logs : null);
}

async function resolveTextChannel(guild, channelId) {
  if (!guild || !channelId) return null;
  const channel = guild.channels.cache.get(channelId) ||
    await guild.channels.fetch(channelId).catch(() => null);
  return channel && channel.isTextBased() ? channel : null;
}

function configuredWelcomeChannelId(guild, settings) {
  if (settings.welcomeDisabled) return null;
  return settings.welcomeChannelId || (guild.id === config.guildId ? config.channels.welcome : null);
}

async function sendAudit(guild, title, description, color) {
  if (!guild) return false;
  const settings = getGuildSettings(guild.id);
  if (!settings.auditEnabled) return false;

  const channelId = configuredChannelId(guild, settings);
  const channel = await resolveTextChannel(guild, channelId);
  if (!channel) return false;

  const me = guild.members.me;
  const permissions = me ? channel.permissionsFor(me) : null;
  if (!permissions?.has(PermissionFlagsBits.ViewChannel) ||
      !permissions?.has(PermissionFlagsBits.SendMessages) ||
      !permissions?.has(PermissionFlagsBits.EmbedLinks)) {
    return false;
  }

  const embed = new EmbedBuilder()
    .setColor(color || config.colors.primary)
    .setTitle(String(title).slice(0, 256))
    .setDescription(String(description || "Sin detalles adicionales.").slice(0, 4000))
    .setFooter({ text: "Registro automático • " + guild.name.slice(0, 150) })
    .setTimestamp();

  await channel.send({
    embeds: [embed],
    allowedMentions: { parse: [] }
  }).catch(error => {
    console.error("No se pudo enviar un registro en " + guild.id + ":", error.message);
  });
  return true;
}

function channelName(channel) {
  return channel ? "#" + String(channel.name || channel.id) : "canal desconocido";
}

function safePreview(value, limit) {
  const cleaned = String(value || "").replace(/@everyone/gi, "@ everyone").replace(/@here/gi, "@ here");
  return cleaned.slice(0, limit || 800) || "(vacío)";
}

module.exports = function registerUnifiedEvents(client) {
  client.on(Events.GuildMemberAdd, async member => {
    try {
      const settings = getGuildSettings(member.guild.id);
      if (settings.autoroleId) {
        const role = member.guild.roles.cache.get(settings.autoroleId) ||
          await member.guild.roles.fetch(settings.autoroleId).catch(() => null);
        const me = member.guild.members.me;
        const safeRole = role && role.id !== member.guild.id && !role.managed &&
          !role.permissions.any([
            PermissionFlagsBits.Administrator,
            PermissionFlagsBits.ManageGuild,
            PermissionFlagsBits.ManageRoles,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.KickMembers,
            PermissionFlagsBits.BanMembers,
            PermissionFlagsBits.ModerateMembers,
            PermissionFlagsBits.ManageWebhooks
          ]);
        if (safeRole && me?.permissions.has(PermissionFlagsBits.ManageRoles) &&
            role.position < me.roles.highest.position && !member.roles.cache.has(role.id)) {
          await member.roles.add(role, "DATASHOP / Velo autorole").catch(async error => {
            console.error("No se pudo asignar autorol:", error.message);
            await sendAudit(member.guild, "No se pudo asignar el autorol",
              "Miembro: " + member.user.tag + " (" + member.id + ")\nRol: " + role.name +
              "\nError: " + error.message, config.colors.warning);
          });
        }
      }

      const welcomeChannel = await resolveTextChannel(member.guild, configuredWelcomeChannelId(member.guild, settings));
      if (welcomeChannel) {
        const permissions = welcomeChannel.permissionsFor(member.guild.members.me);
        if (permissions?.has(PermissionFlagsBits.ViewChannel) &&
            permissions?.has(PermissionFlagsBits.SendMessages) &&
            permissions?.has(PermissionFlagsBits.EmbedLinks)) {
          const embed = new EmbedBuilder()
            .setColor(0xFFFFFF)
            .setTitle("¡Bienvenido a " + member.guild.name.slice(0, 200) + "!")
            .setDescription("¡Hola <@" + member.id + ">! Gracias por unirte. Revisa las reglas y disfruta de la comunidad.")
            .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
            .setFooter({ text: "Miembro #" + member.guild.memberCount })
            .setTimestamp();

          await welcomeChannel.send({
            content: "<@" + member.id + ">",
            embeds: [embed],
            allowedMentions: { users: [member.id] }
          }).catch(error => console.error("No se pudo enviar bienvenida:", error.message));
        }
      }

      await sendAudit(member.guild, "Nuevo miembro", 
        "Usuario: " + member.user.tag + " (<@" + member.id + ">)\nID: " + member.id +
        "\nCuenta creada: <t:" + Math.floor(member.user.createdTimestamp / 1000) + ":R>",
        0x22C55E);
    } catch (error) {
      console.error("Error en GuildMemberAdd:", error);
    }
  });

  client.on(Events.GuildMemberRemove, async member => {
    try {
      const settings = getGuildSettings(member.guild.id);
      const welcomeChannel = await resolveTextChannel(member.guild, configuredWelcomeChannelId(member.guild, settings));
      if (welcomeChannel) {
        const permissions = welcomeChannel.permissionsFor(member.guild.members.me);
        if (permissions?.has(PermissionFlagsBits.SendMessages) && permissions?.has(PermissionFlagsBits.EmbedLinks)) {
          const embed = new EmbedBuilder()
            .setColor(0x64748B)
            .setTitle("Un miembro salió")
            .setDescription("**Usuario:** " + safePreview(member.user.tag, 200) + "\n**ID:** " + member.id +
              "\nAhora hay **" + member.guild.memberCount + "** miembros.")
            .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
            .setTimestamp();
          await welcomeChannel.send({ embeds: [embed], allowedMentions: { parse: [] } })
            .catch(error => console.error("No se pudo enviar despedida:", error.message));
        }
      }
      await sendAudit(member.guild, "Miembro salió",
        "Usuario: " + safePreview(member.user.tag, 200) + " (" + member.id + ")", 0x64748B);
    } catch (error) {
      console.error("Error en GuildMemberRemove:", error);
    }
  });

  client.on(Events.MessageDelete, async message => {
    try {
      if (!message.guild || message.author?.bot) return;
      const text = message.content ? safePreview(message.content, 1400) : "(el contenido no estaba en caché)";
      const attachments = message.attachments?.size
        ? "\nAdjuntos: " + [...message.attachments.values()].map(item => item.name || item.url).join(", ").slice(0, 500)
        : "";
      await sendAudit(message.guild, "Mensaje eliminado",
        "Autor: " + (message.author?.tag || "desconocido") + " (" + (message.author?.id || "sin ID") + ")" +
        "\nCanal: " + channelName(message.channel) + "\nContenido: " + text + attachments,
        0xEF4444);
    } catch (error) {
      console.error("Error registrando mensaje eliminado:", error);
    }
  });

  client.on(Events.MessageUpdate, async (before, after) => {
    try {
      if (!after.guild || after.author?.bot) return;
      const oldMessage = before.partial ? await before.fetch().catch(() => null) : before;
      const newMessage = after.partial ? await after.fetch().catch(() => null) : after;
      if (!oldMessage || !newMessage || oldMessage.content === newMessage.content) return;
      await sendAudit(after.guild, "Mensaje editado",
        "Autor: " + (after.author?.tag || "desconocido") + " (" + after.author.id + ")" +
        "\nCanal: " + channelName(after.channel) +
        "\nAntes: " + safePreview(oldMessage.content, 900) +
        "\nDespués: " + safePreview(newMessage.content, 900) +
        "\n[Ir al mensaje](" + after.url + ")",
        0xF59E0B);
    } catch (error) {
      console.error("Error registrando mensaje editado:", error);
    }
  });

  client.on(Events.GuildBanAdd, async ban => {
    try {
      await sendAudit(ban.guild, "Usuario expulsado permanentemente",
        "Usuario: " + safePreview(ban.user.tag, 200) + " (" + ban.user.id + ")",
        0xEF4444);
    } catch (error) {
      console.error("Error registrando ban:", error);
    }
  });

  client.on(Events.ChannelCreate, async channel => {
    if (!channel.guild) return;
    await sendAudit(channel.guild, "Canal creado",
      "Canal: " + channelName(channel) + "\nID: " + channel.id, 0x22C55E)
      .catch(error => console.error("Error registrando canal creado:", error));
  });

  client.on(Events.ChannelDelete, async channel => {
    if (!channel.guild) return;
    await sendAudit(channel.guild, "Canal eliminado",
      "Canal: " + channelName(channel) + "\nID: " + channel.id, 0xEF4444)
      .catch(error => console.error("Error registrando canal eliminado:", error));
  });

  client.on(Events.ChannelUpdate, async (before, after) => {
    if (!after.guild) return;
    const changes = [];
    if (before.name !== after.name) changes.push("Nombre: " + safePreview(before.name, 100) + " → " + safePreview(after.name, 100));
    if ("topic" in before && "topic" in after && before.topic !== after.topic) {
      changes.push("Tema actualizado.");
    }
    if (changes.length) {
      await sendAudit(after.guild, "Canal actualizado",
        "Canal: " + channelName(after) + "\n" + changes.join("\n"), 0x8B5CF6);
    }
  });

  client.on(Events.GuildMemberUpdate, async (before, after) => {
    try {
      if (before.nickname !== after.nickname) {
        await sendAudit(after.guild, "Apodo actualizado",
          "Usuario: " + safePreview(after.user.tag, 200) + " (" + after.id + ")" +
          "\nAntes: " + safePreview(before.nickname || before.user.username, 100) +
          "\nDespués: " + safePreview(after.nickname || after.user.username, 100),
          0x8B5CF6);
      }

      const beforeRoles = new Set(before.roles.cache.keys());
      const afterRoles = new Set(after.roles.cache.keys());
      const added = [...afterRoles].filter(id => !beforeRoles.has(id)).map(id => after.guild.roles.cache.get(id)).filter(Boolean);
      const removed = [...beforeRoles].filter(id => !afterRoles.has(id)).map(id => after.guild.roles.cache.get(id)).filter(Boolean);
      if (added.length || removed.length) {
        const lines = ["Usuario: " + safePreview(after.user.tag, 200) + " (" + after.id + ")"];
        if (added.length) lines.push("Roles añadidos: " + added.map(role => role.name).join(", ").slice(0, 700));
        if (removed.length) lines.push("Roles retirados: " + removed.map(role => role.name).join(", ").slice(0, 700));
        await sendAudit(after.guild, "Roles de miembro actualizados", lines.join("\n"), 0x8B5CF6);
      }
    } catch (error) {
      console.error("Error registrando cambios de miembro:", error);
    }
  });
};
