const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType,
  PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle
} = require("discord.js");
const config = require("./config");
const { canManageTickets } = require("./utils/permissions");
const { emoji } = require("./ui");
const { readJSON, writeJSON } = require("./storage");
const giveaways = require("./giveaway-service");
const storeStats = require("./store-service");

const applicationAnswers = new Map();
const ticketCreationLocks = new Set();
const ticketClosing = new Set();

module.exports = client => {
  client.on("interactionCreate", async i => {
    try {
      if (i.isButton() && i.customId.startsWith("gift_verify_start:")) return startGiftVerification(i);
      if (i.isModalSubmit() && i.customId.startsWith("gift_verify_submit:")) return finishGiftVerification(i);
      if (i.isStringSelectMenu() && i.customId === "ticket_create") return createTicket(i);
      if (i.isButton() && i.customId.startsWith("ticket_create:")) return createTicket(i);
      if (i.isButton() && i.customId.startsWith("giveaway:join:")) {
        await i.deferReply({ ephemeral: true });
        const giveawayId = i.customId.split(":")[2];
        const result = await giveaways.toggleParticipation(i, client, giveawayId);
        return i.editReply({ content: result.message, allowedMentions: { parse: [] } });
      }
      if (i.isButton() && ["flux_legit_yes", "flux_legit_no"].includes(i.customId)) return handleLegitVote(i);
      if (i.isButton() && ["ticket_claim","ticket_close","ticket_lock","ticket_unlock"].includes(i.customId)) return ticketButton(i);
      if (i.isButton() && i.customId === "application_panel_open") {
        await i.deferReply({ ephemeral: true });
        return createApplication(i);
      }
      if (i.isButton() && i.customId === "application_start") return startApplication(i);
      if (i.isButton() && i.customId === "application_next") return nextApplication(i);
      if (i.isModalSubmit() && i.customId.startsWith("application_answer_")) return answerApplication(i);
      if (i.isButton() && i.customId === "application_close") return closeApplication(i);
      if (i.isButton() && i.customId.startsWith("suggestion_vote:")) return handleSuggestionVote(i);
      if (i.isStringSelectMenu() && i.customId === "help_category") return helpCategory(i, client);
    } catch (e) {
      console.error("Error en interacción:", e);
      const msg = emoji(i.guild, "error", "❌") + " No pude completar esa acción. Revisa los permisos del bot.";
      if (i.deferred) await i.editReply({ content: msg, allowedMentions: { parse: [] } }).catch(() => {});
      else if (i.replied) await i.followUp({ content: msg, ephemeral: true, allowedMentions: { parse: [] } }).catch(() => {});
      else await i.reply({ content: msg, ephemeral: true, allowedMentions: { parse: [] } }).catch(() => {});
    }
  });
};

function safeName(value, fallback) {
  const n = String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
  return n || fallback;
}

function ticketChannels(guild, userId) {
  return guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.topic?.startsWith("VeloTicket:" + userId + ":"));
}

function isStaff(i) {
  return canManageTickets(i.member, config);
}

async function createTicket(i) {
  if (!i.guild) return i.reply({ content: "Este panel solo funciona dentro de un servidor.", ephemeral: true });
  const lockKey = i.guild.id + ":" + i.user.id;
  if (ticketCreationLocks.has(lockKey)) {
    return i.reply({ content: emoji(i.guild, "info", "⏳") + " Ya estoy creando tu ticket. Espera un momento.", ephemeral: true });
  }
  ticketCreationLocks.add(lockKey);
  try {
    return await createTicketLocked(i);
  } finally {
    ticketCreationLocks.delete(lockKey);
  }
}

async function createTicketLocked(i) {
  const type = i.isStringSelectMenu() ? i.values?.[0] : i.customId.split(":")[1];
  const ticketSettings = readJSON("ticket-config.json", {})[i.guild.id] || {};
  if ((ticketSettings.disabledTicketCategories || []).includes(type)) {
    return i.reply({
      content: emoji(i.guild, "info", "ℹ️") + " Esta categoría está temporalmente desactivada. Vuelve al panel y elige otra opción.",
      ephemeral: true
    });
  }
  const baseCategory = config.ticket.categories[type] || ticketSettings.customCategories?.[type];
  const categoryOverride = (ticketSettings.categoryOverrides || {})[type] || {};
  const category = baseCategory ? { ...baseCategory, ...categoryOverride } : null;
  if (category?.emojiInput) {
    const input = String(category.emojiInput).trim();
    const customEmoji = input.match(/^<a?:([a-zA-Z0-9_]+):(\d{17,20})>$/);
    if (customEmoji) {
      category.emojiName = customEmoji[1];
      category.emojiId = customEmoji[2];
      category.emojiUnicode = null;
    } else if (/^\d{17,20}$/.test(input)) {
      category.emojiId = input;
      category.emojiName = i.guild.emojis.cache.get(input)?.name || category.emojiName;
      category.emojiUnicode = null;
    } else if (/\p{Extended_Pictographic}/u.test(input)) {
      category.emojiId = null;
      category.emojiName = null;
      category.emojiUnicode = input;
    } else {
      category.emojiName = input.replace(/^:/, "").replace(/:$/, "");
      const serverEmoji = i.guild.emojis.cache.find(item => item.name === category.emojiName);
      if (serverEmoji) category.emojiId = serverEmoji.id;
      category.emojiUnicode = null;
    }
  }
  if (!category) return i.reply({ content: emoji(i.guild, "error", "❌") + " Tipo de ticket no válido.", ephemeral: true });
  const maxOpenPerUser = Number.isInteger(ticketSettings.maxOpenPerUser) && ticketSettings.maxOpenPerUser > 0
    ? Math.min(ticketSettings.maxOpenPerUser, 10)
    : config.ticket.maxOpenPerUser;
  const open = ticketChannels(i.guild, i.user.id);
  const sameCategory = open.find(channel => channel.topic?.split(":")[2] === type);
  if (sameCategory) {
    return i.reply({ content: emoji(i.guild, "info", "ℹ️") + " Ya tienes un ticket de esta categoría: " + sameCategory + ".", ephemeral: true });
  }
  if (open.size >= maxOpenPerUser) return i.reply({ content: emoji(i.guild, "warning", "⚠️") + " Ya tienes **" + open.size + "/" + maxOpenPerUser + "** tickets abiertos.", ephemeral: true });
  const me = i.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) return i.reply({ content: emoji(i.guild, "error", "❌") + " Flux Store necesita **Gestionar canales**.", ephemeral: true });
  await i.deferReply({ ephemeral: true });
  const configuredParentId = ticketSettings.ticketCategoryId || config.channels.tickets;
  const parent = i.guild.channels.cache.get(configuredParentId);
  const configuredRoleIds = Array.isArray(ticketSettings.supportRoleIds) ? ticketSettings.supportRoleIds : [];
  const staff = i.guild.roles.cache.get(config.roles.staff);
  const admin = i.guild.roles.cache.get(config.roles.admin);
  const staffRoles = [...new Map([staff, admin, ...configuredRoleIds.map(id => i.guild.roles.cache.get(id))].filter(Boolean).map(role => [role.id, role])).values()];
  const template = String(ticketSettings.channelNameTemplate || "ticket-{type}-{username}");
  const renderedName = template
    .replaceAll("{username}", safeName(i.user.username, i.user.id.slice(-6)))
    .replaceAll("{ticket}", i.user.id.slice(-6))
    .replaceAll("{type}", safeName(type));
  const name = safeName(renderedName).slice(0, 90) || type + "-" + i.user.id.slice(-6);
  const ch = await i.guild.channels.create({
    name, type: ChannelType.GuildText, topic: "VeloTicket:" + i.user.id + ":" + type,
    parent: parent?.type === ChannelType.GuildCategory ? parent.id : null,
    permissionOverwrites: [
      { id: i.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] },
      { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ...staffRoles.map(role => ({ id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }))
    ]
  });
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_claim").setLabel("Reclamar").setEmoji(emoji(i.guild, "velo_staff", "👤")).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticket_lock").setLabel("Bloquear").setEmoji(emoji(i.guild, "lock", "🔒")).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket_unlock").setLabel("Desbloquear").setEmoji(emoji(i.guild, "success", "🔓")).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket_close").setLabel("Cerrar").setEmoji(emoji(i.guild, "trash", "🗑️")).setStyle(ButtonStyle.Danger)
  );
  const configuredEmoji = (category.emojiId && i.guild.emojis.cache.get(String(category.emojiId)))
    || (category.emojiName && i.guild.emojis.cache.find(e => e.name === category.emojiName));
  const ticketIcon = configuredEmoji
    ? configuredEmoji.toString()
    : category.emojiUnicode || emoji(i.guild, category.emojiKey || (type === "comprar" ? "velo_buy" : type === "soporte" ? "velo_support" : "velo_ticket"), type === "comprar" ? "🛍️" : "🎫");
  const ticketTitle = String(category.ticketTitle || "{emoji} {name} • FLUX STORE")
    .replaceAll("{emoji}", ticketIcon)
    .replaceAll("{name}", String(category.label || type))
    .replaceAll("{type}", type)
    .slice(0, 256);
  const ticketMessage = String(category.ticketMessage || "Hola {user}, tu ticket está abierto.\n\n**Categoría:** {name}\n**Creador:** {user}\n\nUn miembro del Staff te atenderá pronto.")
    .replaceAll("{user}", "<@" + i.user.id + ">")
    .replaceAll("{name}", String(category.label || type))
    .replaceAll("{emoji}", ticketIcon)
    .replaceAll("{type}", type)
    .slice(0, 4096);
  const ticketColor = String(category.ticketColor || ticketSettings.panelColor || "");
  const embed = new EmbedBuilder()
    .setColor(/^#[0-9A-Fa-f]{6}$/.test(ticketColor) ? parseInt(ticketColor.slice(1), 16) : (config.colors.primary || 0x8B5CF6))
    .setTitle(ticketTitle)
    .setDescription(ticketMessage)
    .setFooter({ text: "FLUX STORE • Ticket " + type }).setTimestamp();
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
    if (ticketClosing.has(i.channel.id)) {
      return i.reply({ content: emoji(i.guild, "info", "ℹ️") + " Este ticket ya se está cerrando.", ephemeral: true });
    }
    ticketClosing.add(i.channel.id);
    try {
      await i.deferReply({ ephemeral: true });
      const transcriptSaved = await sendTranscript(i);
      if (!transcriptSaved) {
        ticketClosing.delete(i.channel.id);
        return i.editReply(
          emoji(i.guild, "error", "❌") +
          " No pude guardar la transcripción; el ticket sigue abierto para no perder el historial. Revisa LOGS_CHANNEL_ID y los permisos del canal de registros."
        );
      }

      const delayMs = config.ticket.closeDelayMs;
      const delaySeconds = Math.ceil(delayMs / 1000);
      await i.editReply(
        emoji(i.guild, "trash", "🗑️") +
        " Transcripción guardada. Ticket cerrado; se eliminará en " + delaySeconds +
        (delaySeconds === 1 ? " segundo." : " segundos.")
      );
      setTimeout(async () => {
        try { await i.channel.delete("Ticket cerrado por " + i.user.tag); }
        catch (error) {
          console.error("No se pudo eliminar el ticket " + i.channel.id + ":", error.message);
        } finally {
          ticketClosing.delete(i.channel.id);
        }
      }, delayMs);
    } catch (error) {
      ticketClosing.delete(i.channel.id);
      throw error;
    }
  }
}

async function sendTranscript(i) {
  const logsChannelId = config.channels.logs;
  if (!logsChannelId) {
    console.error("No se puede guardar la transcripción: LOGS_CHANNEL_ID no está configurado.");
    return false;
  }

  const log = await i.guild.channels.fetch(logsChannelId).catch(error => {
    console.error("No se pudo acceder al canal de registros " + logsChannelId + ":", error?.code || "", error?.message || error);
    return null;
  });
  if (!log?.isTextBased() || typeof log.send !== "function") {
    console.error("No se puede guardar la transcripción: LOGS_CHANNEL_ID no apunta a un canal de texto accesible.");
    return false;
  }

  const botMember = i.guild.members.me || await i.guild.members.fetchMe().catch(() => null);
  const logPermissions = botMember ? log.permissionsFor(botMember) : null;
  const sourcePermissions = botMember ? i.channel.permissionsFor(botMember) : null;
  const canReadTicket = sourcePermissions?.has(PermissionFlagsBits.ViewChannel) &&
    sourcePermissions?.has(PermissionFlagsBits.ReadMessageHistory);
  if (!canReadTicket) {
    console.error("No se puede generar la transcripción del ticket " + i.channel.id + ": el bot necesita Ver canal y Leer historial de mensajes en el ticket.");
    return false;
  }
  const canWriteLogs = logPermissions?.has(PermissionFlagsBits.ViewChannel) &&
    logPermissions?.has(PermissionFlagsBits.SendMessages) &&
    logPermissions?.has(PermissionFlagsBits.AttachFiles);
  if (!canWriteLogs) {
    console.error("No se puede guardar la transcripción en el canal " + logsChannelId + ": el bot necesita Ver canal, Enviar mensajes y Adjuntar archivos.");
    return false;
  }

  try {
    const messages = [];
    let before;
    // Discord devuelve hasta 100 mensajes por petición; el historial se limita a 2.000.
    for (let page = 0; page < 20; page++) {
      const batch = await i.channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      if (!batch.size) break;
      messages.push(...batch.values());
      before = batch.last()?.id;
      if (batch.size < 100) break;
    }

    const lines = messages.reverse().map(m => {
      const body = (m.content || "[sin texto]").replace(/\r/g, "");
      const embeds = m.embeds.map(e => "[embed: " + String(e.title || e.description || "sin descripción").replace(/\s+/g, " ").slice(0, 300) + "]").join(" ");
      const attachments = m.attachments.size ? " [adjuntos: " + [...m.attachments.values()].map(a => a.url).join(", ") + "]" : "";
      return "[" + new Date(m.createdTimestamp).toISOString() + "] " + (m.author?.tag || "Usuario desconocido") + ": " + body + (embeds ? " " + embeds : "") + attachments;
    });
    if (messages.length >= 2000) lines.unshift("[Nota: transcripción limitada a los 2.000 mensajes más recientes.]");

    const sent = await log.send({
      content: emoji(i.guild, "ticket", "🎫") + " Transcripción de **" + i.channel.name + "** (" + messages.length + " mensajes) cerrada por <@" + i.user.id + ">.",
      files: [{ attachment: Buffer.from(lines.join("\n"), "utf8"), name: i.channel.name + "-transcript.txt" }],
      allowedMentions: { parse: [] }
    });
    return Boolean(sent?.id);
  } catch (error) {
    console.error(
      "No se pudo guardar la transcripción del ticket " + i.channel.id + " en " + logsChannelId + ":",
      error?.code || "",
      error?.message || error
    );
    return false;
  }
}

async function handleSuggestionVote(i) {
  if (!i.guildId) return i.reply({ content: "Este botón solo funciona dentro del servidor.", ephemeral: true });

  const parts = i.customId.split(":");
  const choice = parts[1];
  const id = parts[2];
  if (!["up", "down"].includes(choice) || !id) {
    return i.reply({ content: "Este voto no es válido.", ephemeral: true });
  }

  const rows = readJSON("flux-store-suggestions.json", []);
  if (!Array.isArray(rows)) return i.reply({ content: "No hay datos de sugerencias disponibles.", ephemeral: true });
  const suggestion = rows.find(function (row) {
    return row.guildId === i.guildId && row.id === id;
  });
  if (!suggestion) return i.reply({ content: "No encontré esa sugerencia; puede que se haya eliminado.", ephemeral: true });
  if (suggestion.status !== "pending") {
    return i.reply({ content: "Esta sugerencia ya no está pendiente de votación.", ephemeral: true });
  }
  if (suggestion.userId === i.user.id) {
    return i.reply({ content: "No puedes votar tu propia sugerencia.", ephemeral: true });
  }

  suggestion.upvotes = Array.isArray(suggestion.upvotes) ? suggestion.upvotes : [];
  suggestion.downvotes = Array.isArray(suggestion.downvotes) ? suggestion.downvotes : [];
  const prior = suggestion.upvotes.includes(i.user.id) ? "up" :
    suggestion.downvotes.includes(i.user.id) ? "down" : null;
  if (prior === choice) {
    return i.reply({ content: "Tu voto ya está registrado. Puedes pulsar la otra opción para cambiarlo.", ephemeral: true });
  }

  suggestion.upvotes = suggestion.upvotes.filter(function (userId) { return userId !== i.user.id; });
  suggestion.downvotes = suggestion.downvotes.filter(function (userId) { return userId !== i.user.id; });
  if (choice === "up") suggestion.upvotes.push(i.user.id);
  else suggestion.downvotes.push(i.user.id);
  suggestion.updatedAt = new Date().toISOString();
  writeJSON("flux-store-suggestions.json", rows);

  const state = suggestion.status === "approved" ? "✅ Aprobada" :
    suggestion.status === "rejected" ? "❌ Rechazada" : "🟡 Pendiente";
  const embed = i.message.embeds[0]
    ? EmbedBuilder.from(i.message.embeds[0])
    : new EmbedBuilder().setColor(config.colors.primary).setTitle("Sugerencia de FLUX STORE");
  embed.setFields(
    { name: "Estado", value: state, inline: true },
    { name: "A favor", value: String(suggestion.upvotes.length), inline: true },
    { name: "En contra", value: String(suggestion.downvotes.length), inline: true }
  );
  await i.message.edit({ embeds: [embed], components: i.message.components });
  return i.reply({
    content: "✅ Voto actualizado: " + (choice === "up" ? "a favor" : "en contra") + ".",
    ephemeral: true
  });
}

function applicationQuestions() {
  const fallback = ["¿Cuál es tu nombre y usuario de Discord?","¿Qué edad tienes?","¿En qué país estás y cuál es tu zona horaria?","¿Cuántas horas al día puedes dedicar de forma realista a Flux Store?","¿En qué horarios sueles estar disponible?","¿A qué puesto te postulas: Helper, Moderador, Staff, Developer, Configurador o Diseñador?","¿Tienes experiencia como Helper, Moderador o Staff? Explica dónde y qué hacías.","¿Por qué quieres entrar al equipo de Flux Store?","¿Qué habilidades aportarías al equipo y qué te diferencia?","Un miembro hace spam repetidamente después de recibir una advertencia. ¿Qué harías y por qué?","Ves a alguien intentando estafar a otro miembro. ¿Cómo actuarías y qué pruebas guardarías?","Un amigo tuyo incumple las reglas. ¿Cómo resolverías la situación?","Dos usuarios discuten y ambos dicen tener razón. ¿Cómo investigarías el caso de forma imparcial?","Si no sabes cómo resolver un problema, ¿qué harías antes de tomar una decisión?","¿Cómo protegerías la información privada de los miembros y del equipo?","¿Qué harías si otro miembro del Staff abusa de sus permisos?","¿Cómo reaccionas ante críticas o cuando otro Staff te corrige?","¿Has trabajado en otros servidores o comunidades? Indica cuáles y tus responsabilidades.","¿Puedes comprometerte a respetar las reglas, mantener la actividad acordada y tratar a todos con respeto?","¿Por qué deberíamos seleccionarte para el equipo de Flux Store?","¿Hay algo más que quieras añadir a tu postulación?"];
  const data = readJSON("postulaciones.json", { questions: fallback });
  return Array.isArray(data.questions) && data.questions.length ? data.questions.slice(0, 25) : fallback;
}
async function createApplication(i) {
  const me = i.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) return i.editReply(emoji(i.guild, "error", "❌") + " Flux Store necesita **Gestionar canales**.");
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
      ["help", "Centro de comandos"], ["messagecount", "Contar mensajes"], ["serverinfo", "Información de usuario"],
      ["membercount", "Estadísticas de miembros"], ["poll", "Encuestas de la comunidad"], ["banner", "Banner de perfil"],
      ["resena", "Reseñas verificadas"], ["sugerencia", "Proponer mejoras"], ["userinfo", "Información de usuario"],
      ["say", "Enviar mensaje como el bot"]
    ],
    administracion: [
      ["tienda", "Administrar catálogo y stock"], ["ventas", "Ver y editar el contador de ventas"], ["estadisticas-tienda", "Ver métricas de pedidos e ingresos"], ["legit", "Publicar el panel de verificación legit"],
      ["embed", "Publicar embeds personalizados"], ["topic", "Editar tema de canal"], ["nickname", "Administrar apodos"], ["rolemanager", "Añadir o quitar roles"],
      ["purge", "Limpieza filtrada de mensajes"], ["warnings", "Historial de advertencias"], ["permcheck", "Diagnóstico de permisos"], ["ticketstats", "Estadísticas de tickets"],
      ["ticket-config", "Ver configuración de tickets"], ["ticket-panel", "Publicar panel de tickets"],
      ["ticket-edit", "Administrar tickets"], ["postulaciones-panel", "Publicar postulaciones"],
      ["postulaciones-config", "Configurar preguntas"], ["giveaway", "Administrar sorteos"],
      ["lock", "Bloquear canal"], ["unlock", "Desbloquear canal"], ["slowmode", "Configurar modo lento"]
    ],
    utilidad: [
      ["ping", "Latencia del bot"], ["avatar", "Ver avatar"], ["serverinfo", "Información del servidor"],
      ["botinfo", "Información técnica del bot"], ["uptime", "Tiempo activo"], ["channelinfo", "Información de canales"],
      ["roleinfo", "Información de roles"], ["timestamp", "Convertir fecha de Discord"], ["emojistats", "Estadísticas de emojis"],
      ["permcheck", "Comprobar permisos"], ["carrito", "Carrito y pedidos"], ["estadisticas-tienda", "Estadísticas de ventas"],
      ["resena", "Reseñas de clientes"], ["sugerencia", "Sugerencias de la comunidad"], ["userinfo", "Información de usuario"],
      ["help", "Centro de comandos"]
    ],
    moderacion: [
      ["ban", "Banear miembro"], ["kick", "Expulsar miembro"], ["timeout", "Aplicar timeout"],
      ["untimeout", "Quitar timeout"], ["warn", "Advertir miembro"], ["warnings", "Consultar o limpiar advertencias"],
      ["unban", "Quitar baneo"], ["clear", "Borrar mensajes"], ["purge", "Borrar mensajes con filtro"],
      ["nickname", "Cambiar apodos"], ["rolemanager", "Gestionar roles"], ["lock", "Bloquear canal"],
      ["unlock", "Desbloquear canal"], ["slowmode", "Modo lento"]
    ],
    tickets: [
      ["ticket-panel", "Publicar el panel de tickets"], ["ticket", "Información de tickets"],
      ["ticket-edit", "Administrar tickets"], ["ticketstats", "Estadísticas de tickets"],
      ["postulaciones-panel", "Panel de postulaciones"], ["postulaciones-config", "Configurar preguntas"]
    ],
    diversion: [
      ["giveaway", "Sorteos"], ["poll", "Encuestas"], ["tienda", "Ver el catálogo"],
      ["ventas", "Contador de ventas"], ["help", "Centro de comandos"]
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
  const content = "**" + titles[i.values[0]] + "**\n" + lines.join("\n") + "\n\n**COMANDOS DE TIENDA:** " + ["!tienda catalogo", "!tienda agregar Nombre | Precio | Descripción", "!tienda editar Nombre | Precio | Descripción", "!tienda eliminar Nombre", "!ventas ver", "!ventas sumar 1", "!ventas establecer 8", "!legit", "+vouch @cliente Producto | Pago [precio]"].map(x => "`" + x + "`").join(" · ");
  return i.reply({ content: content.slice(0, 1900), ephemeral: true });
}

async function handleLegitVote(i) {
  if (!i.guild) return i.reply({ content: "Este botón solo funciona dentro del servidor.", ephemeral: true });
  const choice = i.customId === "flux_legit_yes" ? "yes" : "no";
  const result = storeStats.voteLegit(i.user.id, choice);
  const embed = i.message.embeds[0] ? EmbedBuilder.from(i.message.embeds[0]) : new EmbedBuilder().setColor(config.colors.primary);
  embed.setDescription(
    "Si tu experiencia con la tienda fue positiva, confirma abajo. Cada persona cuenta una sola vez.\n\n" +
    "✅ **ᴘᴇʀsᴏɴᴀs ǫᴜᴇ ᴠᴇʀɪғɪᴄᴀʀᴏɴ ǫᴜᴇ sᴏᴍᴏs ʟᴇɢɪᴛ:** **" + result.count + "**"
  );
  await i.message.edit({ embeds: [embed] }).catch(() => {});
  await storeStats.refreshCounters(i.guild);
  if (!result.changed) {
    return i.reply({ content: "Ya registramos tu respuesta. El contador no se ha duplicado.", ephemeral: true });
  }
  return i.reply({
    content: choice === "yes"
      ? "✅ Gracias por verificar a Flux STORE como legit. El contador ahora es **" + result.count + "**."
      : "Gracias por tu respuesta. El contador de verificaciones legit es **" + result.count + "**.",
    ephemeral: true
  });
}


async function startGiftVerification(i) {
  if (!i.guild) return i.reply({ content: "Este panel solo funciona dentro de un servidor.", ephemeral: true });
  const roleId = i.customId.split(":")[1];
  const role = i.guild.roles.cache.get(roleId);
  if (!role) return i.reply({ content: "El rol de verificación ya no existe. Pide al staff que publique el panel otra vez.", ephemeral: true });
  if (i.member?.roles?.cache?.has(roleId)) return i.reply({ content: "Ya tienes el rol de verificado. ¡Bienvenido/a!", ephemeral: true });
  const a = Math.floor(Math.random() * 8) + 2;
  const b = Math.floor(Math.random() * 8) + 2;
  const expected = String(a + b);
  const modal = new ModalBuilder()
    .setCustomId("gift_verify_submit:" + roleId + ":" + expected)
    .setTitle("Verificación de seguridad");
  const answer = new TextInputBuilder()
    .setCustomId("answer")
    .setLabel("¿Cuánto es " + a + " + " + b + "?")
    .setPlaceholder("Escribe el resultado")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(3);
  modal.addComponents(new ActionRowBuilder().addComponents(answer));
  return i.showModal(modal);
}

async function finishGiftVerification(i) {
  if (!i.guild) return i.reply({ content: "Esta verificación solo funciona dentro de un servidor.", ephemeral: true });
  const [, roleId, expected] = i.customId.split(":");
  const submitted = i.fields.getTextInputValue("answer").trim();
  if (submitted !== expected) {
    return i.reply({ content: "❌ Respuesta incorrecta. Pulsa **Verificarme** y vuelve a intentarlo.", ephemeral: true });
  }
  const role = i.guild.roles.cache.get(roleId);
  if (!role) return i.reply({ content: "El rol de verificación ya no existe. Avisa al staff.", ephemeral: true });
  const botMember = i.guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles) || role.position >= botMember.roles.highest.position) {
    return i.reply({ content: "No puedo asignar ese rol. El staff debe revisar mis permisos y la posición del rol.", ephemeral: true });
  }
  const member = await i.guild.members.fetch(i.user.id);
  if (member.roles.cache.has(roleId)) return i.reply({ content: "Ya estás verificado/a. ¡Bienvenido/a!", ephemeral: true });
  await member.roles.add(role, "Verificación de miembro completada");
  return i.reply({ content: "✅ ¡Verificación completada! Ya tienes el rol " + role.name + ".", ephemeral: true });
}
