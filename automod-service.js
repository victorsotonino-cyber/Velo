"use strict";

const { PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const config = require("./config");

const bursts = new Map();
const STATE_TTL_MS = 60000;

function getState(key, now) {
  let state = bursts.get(key);
  if (!state || now - state.touchedAt > STATE_TTL_MS) {
    state = { timestamps: [], lastText: "", duplicateCount: 0, touchedAt: now, lastActionAt: 0, blockedUntil: 0 };
    bursts.set(key, state);
  }
  state.touchedAt = now;
  return state;
}

function normalizedContent(message) {
  return String(message.content || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 500);
}

function isExempt(member) {
  return Boolean(member && member.permissions &&
    (member.permissions.has(PermissionFlagsBits.Administrator) ||
     member.permissions.has(PermissionFlagsBits.ManageMessages)));
}

async function logViolation(guild, user, reason, content) {
  const channelId = config.channels.logs;
  if (!channelId) return;
  const channel = guild.channels.cache.get(channelId);
  if (!channel || !channel.isTextBased()) return;

  const embed = new EmbedBuilder()
    .setColor(config.colors.warning)
    .setTitle("🛡️ AutoMod • Mensaje moderado")
    .setDescription("**Usuario:** <@" + user.id + ">\n**Motivo:** " + reason +
      (content ? "\n**Contenido:** " + String(content).slice(0, 300) : ""))
    .setFooter({ text: "FLUX STORE • Moderación automática" })
    .setTimestamp();

  await channel.send({
    embeds: [embed],
    allowedMentions: { parse: [] }
  }).catch(function (error) {
    console.error("No se pudo registrar una infracción de AutoMod:", error.message);
  });
}

async function processMessage(message) {
  if (!config.automod.enabled || !message.guild || message.author.bot || !message.member) return false;
  if (isExempt(message.member)) return false;

  const now = Date.now();
  const key = message.guild.id + ":" + message.author.id;
  const state = getState(key, now);
  const content = normalizedContent(message);

  if (state.blockedUntil > now) {
    await message.delete().catch(function () {});
    return true;
  }

  const invitePattern = /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]+/i;
  if (config.automod.blockInvites && invitePattern.test(message.content || "")) {
    await message.delete().catch(function () {});
    await logViolation(message.guild, message.author, "Enlace de invitación de Discord no permitido", message.content);
    return true;
  }

  const mentionCount = (message.mentions.users ? message.mentions.users.size : 0) +
    (message.mentions.roles ? message.mentions.roles.size : 0);
  if (mentionCount > config.automod.maxMentions) {
    await message.delete().catch(function () {});
    await logViolation(message.guild, message.author, "Exceso de menciones (" + mentionCount + ")", message.content);
    return true;
  }

  state.timestamps = state.timestamps.filter(function (time) {
    return now - time < config.automod.windowSeconds * 1000;
  });
  state.timestamps.push(now);

  if (content && content === state.lastText) state.duplicateCount += 1;
  else state.duplicateCount = 1;
  state.lastText = content;

  if (state.timestamps.length >= config.automod.maxMessages) {
    await message.delete().catch(function () {});
    state.blockedUntil = now + 5000;
    const member = message.member;
    const botMember = message.guild.members.me;
    if (member.moderatable && botMember && botMember.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      await member.timeout(config.automod.timeoutMinutes * 60000, "AutoMod: spam de mensajes").catch(function () {});
    }
    await logViolation(message.guild, message.author,
      "Spam: " + state.timestamps.length + " mensajes en " + config.automod.windowSeconds + " segundos",
      message.content);
    return true;
  }

  if (state.duplicateCount >= config.automod.duplicateLimit && content.length >= 4) {
    await message.delete().catch(function () {});
    state.duplicateCount = 0;
    await logViolation(message.guild, message.author, "Mensajes repetidos", message.content);
    return true;
  }

  if (bursts.size > 5000) {
    for (const entry of bursts.entries()) {
      if (now - entry[1].touchedAt > STATE_TTL_MS) bursts.delete(entry[0]);
      if (bursts.size <= 4000) break;
    }
  }

  return false;
}

module.exports = { processMessage };
