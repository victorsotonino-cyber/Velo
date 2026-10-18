const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType,
  PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle
} = require("discord.js");
const fs = require("fs");
const path = require("path");
const config = require("./config");
const { emoji, commandEmoji } = require("./ui");
const { readJSON, writeJSON } = require("./storage");
const giveaways = require("./giveaway-service");

const applicationAnswers = new Map();

module.exports = client => {
  client.on("interactionCreate", async i => {
    try {
      if (i.isStringSelectMenu() && i.customId === "ticket_create") return createTicket(i);
      if (i.isButton() && i.customId.startsWith("giveaway:join:")) {
        await i.deferReply({ ephemeral: true });
        const giveawayId = i.customId.split(":")[2];
        const result = await giveaways.toggleParticipation(i, client, giveawayId);
        return i.editReply({ content: result.message, allowedMentions: { parse: [] } });
      }
      if (i.isButton() && ["ticket_claim","ticket_close","ticket_lock","ticket_unlock"].includes(i.customId)) return ticketButton(i);
      if (i.isButton() && i.customId === "application_panel_open") {
        await i.deferReply({ ephemeral: true });
        return createApplication(i);
      }
      if (i.isButton() && i.customId === "application_start") return startApplication(i);
      if (i.isButton() && i.customId === "application_next") return nextApplication(i);
      if (i.isModalSubmit() && i.customId.startsWith("application_answer_")) return answerApplication(i);
      if (i.isButton() && i.customId === "application_close") return closeApplication(i);
      if (i.isStringSelectMenu() && i.customId === "help_category") return helpCategory(i, client);
    } catch (e) {
      console.error("Error en interacción:", e);
      const msg = emoji(i.guild, "error", "❌") + " No pude completar esa acción. Revisa los permisos del bot.";
      if (i.replied || i.deferred) await i.followUp({ content: msg, ephemeral: true }).catch(() => {});
      else await i.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
  });
};

function safeName(value, fallback) {
  const n = String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
  return n || fallback;
}

function ticketChannels(guild, userId) {
  return guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.topic?.startsWith("VeloTicket:" + userId));
}

function isStaff(i) {
  return i.member?.permissions?.has(PermissionFlagsBits.ManageChannels) ||
    i.member?.roles?.cache?.has(config.roles.staff);
}

async function createTicket(i) {
  const type = i.values[0], category = config.ticket.categories[type];
  if (!category) return i.reply({ content: emoji(i.guild, "error", "❌") + " Tipo de ticket no válido.", ephemeral: true });
  const open = ticketChannels(i.guild, i.user.id);
  if (open.size >= config.ticket.maxOpenPerUser) return i.reply({ content: emoji(i.guild, "warning", "⚠️") + " Ya tienes **" + open.size + "/" + config.ticket.maxOpenPerUser + "** tickets abiertos.", ephemeral: true });
  const me = i.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) return i.reply({ content: emoji(i.guild, "error", "❌") + " Velo necesita **Gestionar canales**.", ephemeral: true });
  await i.deferReply({ ephemeral: true });
  const parent = i.guild.channels.cache.get(config.channels.tickets);
  const staff = i.guild.roles.cache.get(config.roles.staff);
  const name = type + "-" + safeName(i.user.username, i.user.id.slice(-6));
  const ch = await i.guild.channels.create({
    name, type: ChannelType.GuildText, topic: "VeloTicket:" + i.user.id + ":" + type,
    parent: parent?.type === ChannelType.GuildCategory ? parent.id : null,
    permissionOverwrites: [
      { id: i.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
      { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ...(staff ? [{ id: staff.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : [])
    ]
  });
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_claim").setLabel("Reclamar").setEmoji(emoji(i.guild, "velo_staff", "👤")).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticket_lock").setLabel("Bloquear").setEmoji(emoji(i.guild, "lock", "🔒")).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket_unlock").setLabel("Desbloquear").setEmoji(emoji(i.guild, "success", "🔓")).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket_close").setLabel("Cerrar").setEmoji(emoji(i.guild, "trash", "🗑️")).setStyle(ButtonStyle.Danger)
  );
  const embed = new EmbedBuilder().setColor(config.colors.primary)
    .setTitle(emoji(i.guild, "velo_ticket", "🎫") + " " + category.label + " • Flux Shop")
    .setDescription("Hola " + i.user + ", tu ticket está abierto.\n\n**Categoría:** " + category.label + "\n**Creador:** " + i.user + "\n\nUn miembro del Staff te atenderá pronto.")
    .setFooter({ text: "Flux Shop • Ticket " + type }).setTimestamp();
  await ch.send({ content: i.user + (staff ? " <@&" + staff.id + ">" : ""), embeds: [embed], components: [buttons] });
  return i.editReply(emoji(i.guild, "success", "✅") + " Ticket creado: " + ch);
}

async function ticketButton(i) {
  if (!i.channel?.topic?.startsWith("VeloTicket:")) return;
  if (!isStaff(i)) return i.reply({ content: emoji(i.guild, "error", "❌") + " Solo el Staff puede gestionar este ticket.", ephemeral: true });
  if (i.customId === "ticket_claim") {
    const parts = i.channel.topic.split(":");
    if (parts[3]) return i.reply({ content: emoji(i.guild, "info", "ℹ️") + " Este ticket ya fue reclamado por <@" + parts[3] + ">.", ephemeral: true });
    parts.push(i.user.id); await i.channel.setTopic(parts.join(":"));
    return i.reply(emoji(i.guild, "success", "✅") + " Ticket reclamado por " + i.user + ".");
  }
  const ownerId = i.channel.topic.split(":")[1];
  if (i.customId === "ticket_lock" || i.customId === "ticket_unlock") {
    await i.channel.permissionOverwrites.edit(ownerId, { SendMessages: i.customId === "ticket_unlock" });
    return i.reply(emoji(i.guild, i.customId === "ticket_lock" ? "lock" : "success", i.customId === "ticket_lock" ? "🔒" : "🔓") + (i.customId === "ticket_lock" ? " Usuario bloqueado." : " Usuario desbloqueado."));
  }
  if (i.customId === "ticket_close") {
    await i.deferReply(); await sendTranscript(i);
    await i.editReply(emoji(i.guild, "trash", "🗑️") + " Ticket cerrado. Se eliminará en 5 segundos.");
    setTimeout(() => i.channel.delete("Ticket cerrado por " + i.user.tag).catch(() => {}), config.ticket.closeDelayMs);
  }
}

async function sendTranscript(i) {
  const log = i.guild.channels.cache.get(config.channels.logs);
  if (!log?.isTextBased()) return;
  try {
    const messages = await i.channel.messages.fetch({ limit: 100 });
    const lines = [...messages.values()].reverse().map(m => "[" + new Date(m.createdTimestamp).toISOString() + "] " + m.author.tag + ": " + (m.content || "[sin texto]") + (m.attachments.size ? " [adjuntos: " + [...m.attachments.values()].map(a => a.url).join(", ") + "]" : ""));
    await log.send({ content: emoji(i.guild, "ticket", "🎫") + " Transcripción de **" + i.channel.name + "** cerrada por " + i.user + ".", files: [{ attachment: Buffer.from(lines.join("\n"), "utf8"), name: i.channel.name + "-transcript.txt" }] });
  } catch (e) { console.error("No se pudo guardar transcript:", e.message); }
}

function applicationQuestions() {
  const fallback = ["¿Cuál es tu nick o nombre con el que te conocen?","¿Qué edad tienes?","¿Por qué quieres ser Staff de Flux Shop?","¿Qué sabes hacer? Cuéntanos tus habilidades y experiencia.","¿A qué puesto te gustaría postularte: Developer, Configurador, Diseñador o Staff?","¿En qué servidores has trabajado anteriormente?","¿Qué lenguajes de programación conoces y cuál dominas mejor?","Menciona 2 plugins que conozcas y explica para qué sirven.","¿Qué experiencia tienes trabajando en servidores o comunidades?","¿Por qué deberíamos aceptarte?","¿Hay algo más que quieras agregar?"];
  const data = readJSON("postulaciones.json", { questions: fallback });
  return Array.isArray(data.questions) && data.questions.length ? data.questions.slice(0, 25) : fallback;
}
async function createApplication(i) {
  const me = i.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) return i.editReply(emoji(i.guild, "error", "❌") + " Velo necesita **Gestionar canales**.");
  const open = i.guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.topic?.startsWith("VeloApplication:" + i.user.id));
  if (open.size) return i.editReply(emoji(i.guild, "info", "ℹ️") + " Ya tienes una postulación abierta: " + open.first());
  const parent = i.guild.channels.cache.get(config.channels.tickets), staff = i.guild.roles.cache.get(config.roles.staff);
  const ch = await i.guild.channels.create({ name: "postulacion-" + safeName(i.user.username, i.user.id.slice(-6)), type: ChannelType.GuildText, topic: "VeloApplication:" + i.user.id, parent: parent?.type === ChannelType.GuildCategory ? parent.id : null, permissionOverwrites: [
    { id: i.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
    { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ...(staff ? [{ id: staff.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : [])
  ]});
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("application_start").setLabel("Comenzar").setEmoji(emoji(i.guild, "edit", "✏️")).setStyle(ButtonStyle.Primary));
  await ch.send({ content: i.user + (staff ? " <@&" + staff.id + ">" : ""), embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle(emoji(i.guild, "users", "👥") + " Postulación • Flux Shop").setDescription("Este canal es privado. Pulsa **Comenzar** para responder las preguntas una por una.").setFooter({ text: "Flux Shop • Sistema de postulaciones" })], components: [row] });
  return i.editReply(emoji(i.guild, "success", "✅") + " Postulación creada: " + ch);
}
async function startApplication(i) {
  const questions = applicationQuestions(), ownerId = i.channel.topic?.split(":")[1];
  if (ownerId && ownerId !== i.user.id && !isStaff(i)) return i.reply({ content: emoji(i.guild, "error", "❌") + " Solo el creador puede comenzar.", ephemeral: true });
  applicationAnswers.set(i.channel.id, { userId: ownerId || i.user.id, index: 0, answers: [] }); return showQuestion(i, questions, 0);
}
async function nextApplication(i) {
  const state = applicationAnswers.get(i.channel.id);
  if (!state || state.userId !== i.user.id) return i.reply({ content: emoji(i.guild, "error", "❌") + " Esta postulación no está activa para ti.", ephemeral: true });
  return showQuestion(i, applicationQuestions(), state.index);
}
async function answerApplication(i) {
  const state = applicationAnswers.get(i.channel.id);
  if (!state || state.userId !== i.user.id) return i.reply({ content: emoji(i.guild, "error", "❌") + " Esta postulación no está activa para ti.", ephemeral: true });
  const questions = applicationQuestions(), n = Number(i.customId.split("_").pop());
  if (n !== state.index || n >= questions.length) return i.reply({ content: emoji(i.guild, "error", "❌") + " La pregunta ya no coincide. Pulsa **Comenzar** para reiniciar.", ephemeral: true });
  state.answers.push(i.fields.getTextInputValue("answer").trim()); state.index++; applicationAnswers.set(i.channel.id, state);
  if (state.index < questions.length) return i.reply({ content: emoji(i.guild, "success", "✅") + " Respuesta guardada. Continúa con la siguiente.", components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("application_next").setLabel("Siguiente pregunta").setEmoji(emoji(i.guild, "arrow", "➡️")).setStyle(ButtonStyle.Primary))], ephemeral: true });
  const embed = new EmbedBuilder().setColor(config.colors.success).setTitle(emoji(i.guild, "velo_success", "✅") + " Postulación completada").setDescription("La postulación de " + i.user + " está lista para revisión.").setTimestamp();
  questions.forEach((q, idx) => embed.addFields({ name: (idx + 1) + ". " + q.slice(0, 250), value: (state.answers[idx] || "Sin respuesta").slice(0, 1024) }));
  await i.reply({ content: i.user + (config.roles.staff ? " <@&" + config.roles.staff + ">" : ""), embeds: [embed], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("application_close").setLabel("Cerrar postulación").setEmoji(emoji(i.guild, "trash", "🗑️")).setStyle(ButtonStyle.Danger))] });
  applicationAnswers.delete(i.channel.id);
}
function showQuestion(i, questions, n) {
  const q = questions[n]; if (!q) return i.reply({ content: emoji(i.guild, "error", "❌") + " No hay preguntas configuradas.", ephemeral: true });
  return i.showModal(new ModalBuilder().setCustomId("application_answer_" + n).setTitle("Postulación • Pregunta " + (n + 1)).addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("answer").setLabel("Tu respuesta").setPlaceholder(q.slice(0, 100)).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000))));
}
async function closeApplication(i) {
  if (!isStaff(i)) return i.reply({ content: emoji(i.guild, "error", "❌") + " Solo el Staff puede cerrar.", ephemeral: true });
  await i.reply(emoji(i.guild, "trash", "🗑️") + " Postulación cerrada. Se eliminará en 5 segundos.");
  setTimeout(() => i.channel.delete("Postulación cerrada").catch(() => {}), config.ticket.closeDelayMs);
}

async function helpCategory(i, client) {
  const entries = {
    comunidad: [
      ["afk", "Estado ausente"], ["anuncio", "Crear anuncios"], ["avatar", "Ver avatar"],
      ["help", "Centro de comandos"], ["messagecount", "Contar mensajes"], ["serverinfo", "Información del servidor"],
      ["say", "Enviar mensaje como el bot"]
    ],
    administracion: [
      ["ticket-config", "Ver configuración de tickets"], ["ticket-panel", "Publicar panel de tickets"],
      ["ticket-edit", "Administrar tickets"], ["postulaciones-panel", "Publicar postulaciones"],
      ["postulaciones-config", "Configurar preguntas"], ["giveaway", "Administrar sorteos"],
      ["lock", "Bloquear canal"], ["unlock", "Desbloquear canal"], ["slowmode", "Configurar modo lento"]
    ],
    utilidad: [
      ["ping", "Latencia del bot"], ["avatar", "Ver avatar"], ["serverinfo", "Información del servidor"],
      ["help", "Centro de comandos"]
    ],
    moderacion: [
      ["ban", "Banear miembro"], ["kick", "Expulsar miembro"], ["timeout", "Aplicar timeout"],
      ["untimeout", "Quitar timeout"], ["warn", "Advertir miembro"], ["unban", "Quitar baneo"],
      ["clear", "Borrar mensajes"], ["lock", "Bloquear canal"], ["unlock", "Desbloquear canal"],
      ["slowmode", "Modo lento"]
    ],
    tickets: [
      ["ticket-panel", "Publicar el panel de tickets"], ["ticket", "Información de tickets"],
      ["ticket-edit", "Administrar tickets"], ["postulaciones-panel", "Panel de postulaciones"],
      ["postulaciones-config", "Configurar preguntas"]
    ],
    diversion: [
      ["giveaway", "Sorteos"], ["help", "Centro de comandos"]
    ]
  };
  const titles = {
    comunidad: "👥 COMUNIDAD",
    administracion: "⚙️ ADMINISTRACIÓN",
    utilidad: "🧰 UTILIDAD",
    moderacion: "🛡️ MODERACIÓN",
    tickets: "🎫 TICKETS Y POSTULACIONES",
    diversion: "🎮 DIVERSIÓN"
  };
  const list = entries[i.values[0]] || [];
  const lines = list.map(([name, desc]) => {
    const exists = client.commands.has(name);
    return (exists ? "🟢" : "🟠") + " **/" + name + "** — " + desc + (exists ? "" : " *(no está cargado en esta versión)*");
  });
  const content = "**" + titles[i.values[0]] + "**\n" + lines.join("\n");
  return i.reply({ content: content.slice(0, 1900), ephemeral: true });
}
