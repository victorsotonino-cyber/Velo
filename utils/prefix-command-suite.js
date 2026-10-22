"use strict";

const {
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");
const config = require("../config");
const storeService = require("../store-service");
const warningService = require("./warnings-service");
const { canModerateTarget } = require("./permissions");
const { formatDuration, parseHexColor, getTicketStats, canManageRole, isValidUnixSeconds } = require("./command-helpers");

async function executePrefix(message, command, args, client) {
  switch (command) {
    case "botinfo": {
      const memory = process.memoryUsage();
      const embed = new EmbedBuilder().setColor(config.colors.primary || 0x8B5CF6)
        .setTitle("FLUX STORE • Información del bot")
        .setThumbnail(client.user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: "Cuenta", value: client.user.tag, inline: true },
          { name: "Servidores", value: String(client.guilds.cache.size), inline: true },
          { name: "Comandos slash", value: String(client.commands?.size || 0), inline: true },
          { name: "Tiempo activo", value: formatDuration(process.uptime() * 1000), inline: true },
          { name: "Memoria heap", value: (memory.heapUsed / 1024 / 1024).toFixed(1) + " MB", inline: true },
          { name: "Gateway", value: client.ws.ping >= 0 ? client.ws.ping + " ms" : "No disponible", inline: true }
        ).setTimestamp();
      await message.reply({ embeds: [embed], allowedMentions: { parse: [] } });
      return true;
    }
    case "uptime": {
      await message.reply("⏱️ FLUX STORE lleva activo " + formatDuration(process.uptime() * 1000) +
        ". Latencia de Gateway: " + (client.ws.ping >= 0 ? client.ws.ping + " ms" : "No disponible") + ".");
      return true;
    }
    case "membercount": {
      const cached = message.guild.members.cache;
      const bots = cached.filter(member => member.user.bot).size;
      const embed = new EmbedBuilder().setColor(config.colors.primary || 0x8B5CF6)
        .setTitle("👥 " + message.guild.name + " • Miembros")
        .addFields(
          { name: "Total", value: String(message.guild.memberCount), inline: true },
          { name: "Humanos en caché", value: String(cached.size - bots), inline: true },
          { name: "Bots en caché", value: String(bots), inline: true },
          { name: "Boosts", value: String(message.guild.premiumSubscriptionCount ?? 0), inline: true }
        ).setFooter({ text: "El total procede del servidor; humanos y bots usan la caché." });
      await message.reply({ embeds: [embed], allowedMentions: { parse: [] } });
      return true;
    }
    case "channelinfo": {
      const channel = message.mentions.channels.first() || message.channel;
      const typeLabels = {
        [ChannelType.GuildText]: "Texto",
        [ChannelType.GuildAnnouncement]: "Anuncios",
        [ChannelType.GuildVoice]: "Voz",
        [ChannelType.GuildCategory]: "Categoría",
        [ChannelType.GuildForum]: "Foro",
        [ChannelType.GuildStageVoice]: "Escenario",
        [ChannelType.PublicThread]: "Hilo público",
        [ChannelType.PrivateThread]: "Hilo privado"
      };
      const fields = [
        { name: "ID", value: channel.id, inline: true },
        { name: "Tipo", value: typeLabels[channel.type] || "Tipo " + channel.type, inline: true },
        { name: "Creado", value: "<t:" + Math.floor(channel.createdTimestamp / 1000) + ":F>", inline: false }
      ];
      if (channel.parent) fields.push({ name: "Categoría", value: channel.parent.name, inline: true });
      if ("topic" in channel) fields.push({ name: "Tema", value: String(channel.topic || "Sin tema").slice(0, 1024), inline: false });
      if (typeof channel.rateLimitPerUser === "number") fields.push({ name: "Modo lento", value: channel.rateLimitPerUser + " s", inline: true });
      await message.reply({ embeds: [new EmbedBuilder().setColor(config.colors.primary || 0x8B5CF6).setTitle("Canal • " + channel.name).addFields(fields)], allowedMentions: { parse: [] } });
      return true;
    }
    case "timestamp": {
      const raw = String(args[0] || "");
      if (!isValidUnixSeconds(raw)) {
        await message.reply("Uso: !timestamp segundos_unix (entre 0 y 4102444800).");
        return true;
      }
      const seconds = Number(raw);
      await message.reply({
        content: "UTC: " + new Date(seconds * 1000).toISOString() +
          "\nFecha completa: <t:" + seconds + ":F>\nFecha corta: <t:" + seconds + ":d>\nHora: <t:" + seconds + ":t>\nRelativo: <t:" + seconds + ":R>\nCódigo para copiar: " +
          String.fromCharCode(96) + "<t:" + seconds + ":F>" + String.fromCharCode(96),
        allowedMentions: { parse: [] }
      });
      return true;
    }
    case "emojistats": {
      const emojis = [...message.guild.emojis.cache.values()];
      const animated = emojis.filter(item => item.animated).length;
      const embed = new EmbedBuilder().setColor(config.colors.primary || 0x8B5CF6)
        .setTitle("✨ Emojis de " + message.guild.name)
        .addFields(
          { name: "Total", value: String(emojis.length), inline: true },
          { name: "Estáticos", value: String(emojis.length - animated), inline: true },
          { name: "Animados", value: String(animated), inline: true },
          { name: "Ejemplos", value: emojis.slice(0, 15).map(item => item.toString()).join(" ") || "Sin emojis personalizados en caché.", inline: false }
        );
      await message.reply({ embeds: [embed], allowedMentions: { parse: [] } });
      return true;
    }
    case "banner": {
      const selected = message.mentions.users.first() || message.author;
      const user = await client.users.fetch(selected.id, { force: true }).catch(() => selected);
      const bannerURL = typeof user.bannerURL === "function" ? user.bannerURL({ size: 1024 }) : null;
      if (!bannerURL) {
        await message.reply("Ese usuario no tiene un banner disponible o Discord no lo devolvió.");
        return true;
      }
      const embed = new EmbedBuilder().setColor(config.colors.primary || 0x8B5CF6)
        .setTitle("Banner de " + user.tag).setImage(bannerURL);
      await message.reply({ embeds: [embed], allowedMentions: { parse: [] } });
      return true;
    }
    case "purge": {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        await message.reply("❌ Necesitas Gestionar mensajes para usar !purge.");
        return true;
      }
      const amount = Number(args[0]);
      if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
        await message.reply("Uso: !purge 1-100 [@usuario]");
        return true;
      }
      if (typeof message.channel.bulkDelete !== "function") {
        await message.reply("Este canal no admite limpieza masiva.");
        return true;
      }
      const target = message.mentions.users.first();
      const fetched = await message.channel.messages.fetch({ limit: amount });
      const selected = target ? fetched.filter(item => item.author.id === target.id) : fetched;
      if (!selected.size) {
        await message.reply("No encontré mensajes recientes que coincidan con el filtro.");
        return true;
      }
      const deleted = await message.channel.bulkDelete(selected, true);
      const report = await message.channel.send("🧹 Se eliminaron " + deleted.size + " mensaje(s)." + (target ? " Filtro: " + target.tag + "." : ""));
      setTimeout(() => report.delete().catch(() => {}), 7000);
      return true;
    }
    case "nickname": {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageNicknames)) {
        await message.reply("❌ Necesitas Gestionar apodos.");
        return true;
      }
      const target = message.mentions.members.first();
      const nickname = args.slice(1).join(" ").trim();
      if (!target || !nickname) {
        await message.reply("Uso: !nickname @usuario nuevo apodo | usa !nickname @usuario quitar para borrar.");
        return true;
      }
      if (!canModerateTarget(message.member, target, message.guild.ownerId) || !target.manageable) {
        await message.reply("❌ No puedes modificar a ese miembro por la jerarquía de roles.");
        return true;
      }
      const next = ["quitar", "reset", "borrar"].includes(nickname.toLowerCase()) ? null : nickname.slice(0, 32);
      await target.setNickname(next, "Cambio de apodo por " + message.author.tag);
      await message.reply(next ? "✅ Apodo actualizado para " + target.user.tag + "." : "✅ Apodo eliminado para " + target.user.tag + ".");
      return true;
    }
    case "rolemanager": {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        await message.reply("❌ Necesitas Gestionar roles.");
        return true;
      }
      const action = String(args[0] || "").toLowerCase();
      const target = message.mentions.members.first();
      const role = message.mentions.roles.first();
      if (!["add", "remove"].includes(action) || !target || !role) {
        await message.reply("Uso: !rolemanager add @usuario @rol o !rolemanager remove @usuario @rol");
        return true;
      }
      if (target.id === message.author.id || target.id === message.guild.ownerId ||
          !canManageRole(message.member, message.guild.members.me, role, message.guild.ownerId) || !target.manageable) {
        await message.reply("❌ No puedes modificar ese miembro o rol por la jerarquía de permisos.");
        return true;
      }
      if (action === "add") {
        if (target.roles.cache.has(role.id)) {
          await message.reply("Ese miembro ya tiene ese rol.");
          return true;
        }
        await target.roles.add(role, "Role manager de " + message.author.tag);
        await message.reply("✅ Rol asignado a " + target.user.tag + ".");
      } else {
        if (!target.roles.cache.has(role.id)) {
          await message.reply("Ese miembro no tiene ese rol.");
          return true;
        }
        await target.roles.remove(role, "Role manager de " + message.author.tag);
        await message.reply("✅ Rol retirado de " + target.user.tag + ".");
      }
      return true;
    }
    case "ticketstats": {
      if (!storeService.isStoreStaff(message.member) && !message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await message.reply("❌ Solo administración o staff autorizado puede ver las estadísticas de tickets.");
        return true;
      }
      const channels = message.guild.channels.cache.filter(channel => channel.type === ChannelType.GuildText);
      const stats = getTicketStats(channels);
      const byCategory = Object.entries(stats.categories).sort((a, b) => b[1] - a[1]).map(([name, count]) => name + ": " + count).join("\n") || "No hay tickets abiertos.";
      const embed = new EmbedBuilder().setColor(config.colors.primary || 0x8B5CF6)
        .setTitle("🎫 FLUX STORE • Estadísticas de tickets")
        .addFields(
          { name: "Tickets abiertos", value: String(stats.total), inline: true },
          { name: "Clientes", value: String(stats.uniqueOwners), inline: true },
          { name: "Distribución", value: byCategory.slice(0, 1024), inline: false }
        );
      await message.reply({ embeds: [embed], allowedMentions: { parse: [] } });
      return true;
    }
    case "embed": {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        await message.reply("❌ Necesitas Gestionar mensajes para crear embeds.");
        return true;
      }
      const raw = message.content.slice(PREFIX.length + command.length).trim();
      const parts = raw.split("|").map(value => value.trim());
      if (parts.length < 2 || !parts[0] || !parts[1]) {
        await message.reply("Uso: !embed título | descripción | #8B5CF6");
        return true;
      }
      const color = parseHexColor(parts[2] || "#8B5CF6");
      if (color === null) {
        await message.reply("El color debe tener formato hexadecimal de seis dígitos, por ejemplo #8B5CF6.");
        return true;
      }
      const embed = new EmbedBuilder().setColor(color).setTitle(parts[0].slice(0, 250)).setDescription(parts[1].slice(0, 3500)).setAuthor({ name: "FLUX STORE" }).setTimestamp();
      await message.channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      await message.reply("✅ Embed publicado.");
      return true;
    }
    case "topic": {
      if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        await message.reply("❌ Necesitas Gestionar canales para cambiar el tema.");
        return true;
      }
      if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(message.channel.type)) {
        await message.reply("Este comando solo funciona en canales de texto o anuncios.");
        return true;
      }
      const raw = args.join(" ").trim();
      if (!raw) {
        await message.reply("Uso: !topic nuevo tema del canal | usa !topic borrar para eliminarlo.");
        return true;
      }
      const next = ["borrar", "quitar", "delete"].includes(raw.toLowerCase()) ? null : raw.slice(0, 1024);
      await message.channel.setTopic(next, "Tema actualizado por " + message.author.tag);
      await message.reply(next ? "✅ Tema actualizado." : "✅ Tema eliminado.");
      return true;
    }
    case "warnings": {
      if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        await message.reply("❌ Necesitas Moderar miembros para usar !warnings.");
        return true;
      }
      const action = String(args[0] || "view").toLowerCase();
      const target = message.mentions.users.first();
      if (!["view", "clear"].includes(action) || !target) {
        await message.reply("Uso: !warnings view @usuario o !warnings clear @usuario");
        return true;
      }
      if (action === "view") {
        const rows = warningService.listWarnings(message.guild.id, target.id);
        const lines = rows.slice(0, 10).map(row => row.id + " • " + row.reason.slice(0, 200) + " • " + row.moderatorTag);
        await message.reply(rows.length ? ("Advertencias de " + target.tag + " (" + rows.length + "):\n" + lines.join("\n").slice(0, 1700)) : target.tag + " no tiene advertencias guardadas.");
        return true;
      }
      const removed = warningService.clearWarnings(message.guild.id, target.id);
      await message.reply(removed ? "✅ Se eliminaron " + removed + " advertencia(s) de " + target.tag + "." : "No hay advertencias guardadas para ese usuario.");
      return true;
    }
    default:
      return false;
  }
}

module.exports = { executePrefix };
