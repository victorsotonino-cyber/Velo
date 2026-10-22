"use strict";

// FLUX STORE: automatización de inactividad inspirada en funciones públicas de
// Ticket-Tool-X (menús, aviso previo, cancelación y transcripciones). Esta
// implementación es propia y se integra con el formato VeloTicket existente.
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, PermissionFlagsBits
} = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const { readJSON, writeJSON } = require("./storage");
const config = require("./config");

const SETTINGS_FILE = "ticket-config.json";
const WARNING_AFTER_MS = 24 * 60 * 60 * 1000;
const CANCEL_WINDOW_MS = 10 * 60 * 1000;
const MAX_MESSAGES = 1000;
const warnings = new Map();
const reminders = new Set();
const busy = new Set();

function loadSettings() {
  return readJSON(SETTINGS_FILE, {});
}
function settingsFor(guildId) {
  const all = loadSettings();
  const current = all[guildId] || {};
  return {
    enabled: current.autoCloseEnabled === true,
    hours: Math.max(1, Math.min(720, Number(current.autoCloseHours) || 24)),
    logChannelId: current.transcriptChannelId || current.logChannelId || config.channels?.logs || null,
    mode: ["channel", "dm", "both"].includes(current.transcriptMode) ? current.transcriptMode : "channel",
    reminderHours: Number.isInteger(Number(current.staffReminderHours)) && Number(current.staffReminderHours) >= 1
      ? Math.min(168, Number(current.staffReminderHours)) : 0,
    supportRoleIds: Array.isArray(current.supportRoleIds) ? current.supportRoleIds : []
  };
}
function parseTicket(channel) {
  if (!channel?.topic?.startsWith("VeloTicket:")) return null;
  const parts = channel.topic.split(":");
  if (!/^\d{17,20}$/.test(parts[1] || "")) return null;
  return { ownerId: parts[1], type: parts[2] || "ticket", claimedBy: parts[3] || null };
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[ch]));
}
async function collectMessages(channel) {
  const result = [];
  let before;
  for (let page = 0; page < 10; page++) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!batch.size) break;
    result.push(...batch.values());
    before = batch.last()?.id;
    if (batch.size < 100 || result.length >= MAX_MESSAGES) break;
  }
  return result.reverse().slice(-MAX_MESSAGES);
}
async function makeHtmlTranscript(channel) {
  const messages = await collectMessages(channel);
  const rows = messages.map(m => {
    const attachments = [...m.attachments.values()].map(a =>
      '<li><a href="' + escapeHtml(a.url) + '">' + escapeHtml(a.name || "Adjunto") + '</a></li>'
    ).join("");
    const embeds = m.embeds.map(e => escapeHtml(e.title || e.description || "Embed")).join(" · ");
    return '<article class="message"><header>' + escapeHtml(m.author?.tag || "Usuario") +
      ' · ' + escapeHtml(new Date(m.createdTimestamp).toLocaleString("es-ES")) +
      '</header><p>' + escapeHtml(m.content || (embeds ? "[Embed: " + embeds + "]" : "[sin texto]")) +
      '</p>' + (attachments ? '<ul>' + attachments + '</ul>' : "") + '</article>';
  }).join("\n");
  const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">' +
    '<title>Transcripción ' + escapeHtml(channel.name) + '</title><style>' +
    'body{font:15px system-ui;background:#111827;color:#e5e7eb;margin:0;padding:24px}' +
    'main{max-width:960px;margin:auto}h1{color:#c4b5fd}.message{padding:12px 16px;margin:10px 0;background:#1f2937;border-radius:10px;overflow-wrap:anywhere}' +
    'header{font-size:12px;color:#a5b4fc;margin-bottom:8px}a{color:#93c5fd}</style></head><body><main><h1>FLUX STORE · Transcripción</h1>' +
    '<p>Canal: #' + escapeHtml(channel.name) + ' · Mensajes: ' + messages.length + '</p>' +
    (rows || "<p>No hay mensajes.</p>") + '</main></body></html>';
  return Buffer.from(html, "utf8");
}
async function deliverTranscript(guild, channel, ticket) {
  const s = settingsFor(guild.id);
  const file = { attachment: await makeHtmlTranscript(channel), name: "transcript-" + channel.id + ".html" };
  const content = "📑 Transcripción de **#" + channel.name + "** · cliente <@" + ticket.ownerId + ">.";
  let sent = false;
  if (s.mode === "channel" || s.mode === "both") {
    const target = s.logChannelId ? await guild.channels.fetch(s.logChannelId).catch(() => null) : null;
    if (target?.isTextBased() && typeof target.send === "function") {
      await target.send({ content, files: [file], allowedMentions: { parse: [] } });
      sent = true;
    }
  }
  if (s.mode === "dm" || s.mode === "both") {
    const user = await guild.client.users.fetch(ticket.ownerId).catch(() => null);
    if (user) {
      await user.send({ content: "Aquí tienes la transcripción HTML de tu ticket de FLUX STORE.", files: [file] })
        .then(() => { sent = true; }).catch(() => {});
    }
  }
  return sent;
}
function cancelRow(channelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticketx:cancel:" + channelId).setLabel("Cancelar autocierre").setStyle(ButtonStyle.Success)
  );
}
async function closeForInactivity(channel, ticket) {
  if (busy.has(channel.id)) return;
  busy.add(channel.id);
  try {
    const delivered = await deliverTranscript(channel.guild, channel, ticket);
    if (!delivered) {
      await channel.send("⚠️ No pude entregar la transcripción. El ticket se mantiene abierto; revisa la configuración de logs/DM.");
      return;
    }
    const member = await channel.guild.members.fetch(ticket.ownerId).catch(() => null);
    if (member) {
      await channel.permissionOverwrites.edit(member, {
        SendMessages: false, AddReactions: false
      }).catch(() => {});
    }
    await channel.send("🔒 Ticket cerrado automáticamente por inactividad. Se generó la transcripción HTML.");
    const fresh = await channel.fetch().catch(() => null);
    if (fresh && !fresh.name.startsWith("closed-")) {
      await fresh.setName(("closed-" + fresh.name).slice(0, 100)).catch(() => {});
    }
  } catch (error) {
    console.error("[ticket-automation] Error al cerrar ticket:", error);
  } finally {
    busy.delete(channel.id);
    warnings.delete(channel.id);
    reminders.delete(channel.id);
  }
}

module.exports = function registerTicketAutomation(client) {
  client.on(Events.MessageCreate, async message => {
    if (!message.guild || message.author.bot) return;
    const ticket = parseTicket(message.channel);
    if (!ticket) return;
    reminders.delete(message.channel.id);
    const pending = warnings.get(message.channel.id);
    if (pending) {
      clearTimeout(pending.timeout);
      warnings.delete(message.channel.id);
      await pending.message.edit({ content: "✅ La actividad del cliente canceló el autocierre.", components: [] }).catch(() => {});
    }
  });

  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton() || !interaction.customId.startsWith("ticketx:cancel:")) return;
    const channelId = interaction.customId.split(":")[2];
    const ticket = parseTicket(interaction.channel);
    if (!ticket || interaction.channel.id !== channelId) {
      return interaction.reply({ content: "Este control ya no corresponde a este ticket.", ephemeral: true });
    }
    if (interaction.user.id !== ticket.ownerId && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
      return interaction.reply({ content: "Solo el cliente o el staff con permisos puede cancelar el autocierre.", ephemeral: true });
    }
    const pending = warnings.get(channelId);
    if (!pending) return interaction.reply({ content: "No hay un autocierre pendiente en este ticket.", ephemeral: true });
    clearTimeout(pending.timeout);
    warnings.delete(channelId);
    await pending.message.edit({ content: "✅ Autocierre cancelado.", components: [] }).catch(() => {});
    return interaction.reply({ content: "Autocierre cancelado. Si el ticket vuelve a quedar inactivo, podrá activarse de nuevo.", ephemeral: true });
  });

  client.once(Events.ClientReady, () => {
    const scan = async () => {
      for (const guild of client.guilds.cache.values()) {
        const s = settingsFor(guild.id);
        if (!s.enabled && !s.reminderHours) continue;
        for (const channel of guild.channels.cache.values()) {
          if (!channel.isTextBased() || !channel.messages || warnings.has(channel.id) || busy.has(channel.id)) continue;
          const ticket = parseTicket(channel);
          if (!ticket) continue;
          try {
            const last = await channel.messages.fetch({ limit: 10 });
            const latestHumanMessage = [...last.values()].find(m => !m.author.bot);
            const lastActivity = latestHumanMessage?.createdTimestamp || channel.createdTimestamp;
            const waitingOnStaff = latestHumanMessage && latestHumanMessage.author.id === ticket.ownerId;

            if (s.reminderHours && waitingOnStaff && !reminders.has(channel.id) &&
                Date.now() - lastActivity >= s.reminderHours * 3600000) {
              const roles = s.supportRoleIds.filter(id => guild.roles.cache.has(id));
              const mentions = roles.map(id => "<@&" + id + ">").join(" ");
              await channel.send({
                content: "⏰ **Recordatorio de soporte:** el cliente <@" + ticket.ownerId +
                  "> lleva " + s.reminderHours + " h esperando una respuesta." +
                  (mentions ? "\\n" + mentions : ""),
                allowedMentions: { users: [ticket.ownerId], roles }
              });
              reminders.add(channel.id);
            }

            if (!s.enabled || warnings.has(channel.id) || Date.now() - lastActivity < s.hours * 3600000) continue;
            const message = await channel.send({
              content: "⏳ <@" + ticket.ownerId + ">, este ticket está inactivo. Se cerrará en 10 minutos si no respondes.",
              components: [cancelRow(channel.id)],
              allowedMentions: { users: [ticket.ownerId] }
            });
            const timeout = setTimeout(() => closeForInactivity(channel, ticket), CANCEL_WINDOW_MS);
            warnings.set(channel.id, { message, timeout });
          } catch (error) {
            console.error("[ticket-automation] No se pudo comprobar " + channel.id + ":", error.message);
          }
        }
      }
    };
    scan().catch(console.error);
    setInterval(() => scan().catch(console.error), 5 * 60 * 1000);
  });
};
