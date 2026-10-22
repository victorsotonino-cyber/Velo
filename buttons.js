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
const storeStats = require("./store-service");

const applicationAnswers = new Map();
const ticketCreationLocks = new Set();
const ticketClosing = new Set();

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
  return guild.channels.cache.filter(c => c.type === ChannelType.GuildText && c.topic?.startsWith("VeloTicket:" + userId + ":"));
}

function isStaff(i) {
  return i.member?.permissions?.has(PermissionFlagsBits.ManageChannels) ||
    i.member?.roles?.cache?.has(config.roles.staff);
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
  const type = i.values[0], category = config.ticket.categories[type];
  if (!category) return i.reply({ content: emoji(i.guild, "error", "❌") + " Tipo de ticket no válido.", ephemeral: true });
  const open = ticketChannels(i.guild, i.user.id);
  const sameCategory = open.find(channel => channel.topic?.split(":")[2] === type);
  if (sameCategory) {
    return i.reply({ content: emoji(i.guild, "info", "ℹ️") + " Ya tienes un ticket de esta categoría: " + sameCategory + ".", ephemeral: true });
  }
  if (open.size >= config.ticket.maxOpenPerUser) return i.reply({ content: emoji(i.guild, "warning", "⚠️") + " Ya tienes **" + open.size + "/" + config.ticket.maxOpenPerUser + "** tickets abiertos.", ephemeral: true });
  const me = i.guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) return i.reply({ content: emoji(i.guild, "error", "❌") + " Flux Store necesita **Gestionar canales**.", ephemeral: true });
  await i.deferReply({ ephemeral: true });
  const parent = i.guild.channels.cache.get(config.channels.tickets);
  const staff = i.guild.roles.cache.get(config.roles.staff);
  const admin = i.guild.roles.cache.get(config.roles.admin);
  const staffRoles = [...new Map([staff, admin].filter(Boolean).map(role => [role.id, role])).values()];
  const name = type + "-" + safeName(i.user.username, i.user.id.slice(-6));
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
    : emoji(i.guild, category.emojiKey || (type === "comprar" ? "velo_buy" : type === "soporte" ? "velo_support" : "velo_ticket"), type === "comprar" ? "🛍️" : "🎫");
  const embed = new EmbedBuilder().setColor(config.colors.primary)
    .setTitle(ticketIcon + " " + category.label + " • Flux STORE")
    .setDescription("Hola <@" + i.user.id + ">, tu ticket está abierto.\n\n**Categoría:** " + category.label + "\n**Creador:** <@" + i.user.id + ">\n\nUn miembro del Staff te atenderá pronto.")
    .setFooter({ text: "Flux STORE • Ticket " + type }).setTimestamp();
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
      await i.deferReply();
      await sendTranscript(i);
      await i.editReply(emoji(i.guild, "trash", "🗑️") + " Ticket cerrado. Se eliminará en 5 segundos.");
      setTimeout(async () => {
        try { await i.channel.delete("Ticket cerrado por " + i.user.tag); }
        catch (_) {}
        finally { ticketClosing.delete(i.channel.id); }
      }, config.ticket.closeDelayMs);
    } catch (error) {
      ticketClosing.delete(i.channel.id);
      throw error;
    }
  }
}

async function sendTranscript(i) {
  const log = i.guild.channels.cache.get(config.channels.logs);
  if (!log?.isTextBased()) return;
  try {
    const messages = [];
    let before;
    // Discord devuelve hasta 100 mensajes por petición; paginamos hasta 2.000 para no perder
    // el historial antiguo en tickets largos ni pedir un volumen ilimitado de datos.
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
    await log.send({ content: emoji(i.guild, "ticket", "🎫") + " Transcripción de **" + i.channel.name + "** (" + messages.length + " mensajes) cerrada por " + i.user + ".", files: [{ attachment: Buffer.from(lines.join("\n"), "utf8"), name: i.channel.name + "-transcript.txt" }] });
  } catch (e) { console.error("No se pudo guardar transcript:", e.message); }
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
      ["help", "Centro de comandos"], ["messagecount", "Contar mensajes"], ["serverinfo", "Información del servidor"],
      ["say", "Enviar mensaje como el bot"]
    ],
    administracion: [
      ["tienda", "Administrar el catálogo de productos y precios"], ["ventas", "Ver y editar el contador de ventas"], ["legit", "Publicar el panel de verificación legit"],
      ["ticket-config", "Ver configuración de tickets"], ["ticket-panel", "Publicar panel de tickets"],
      ["ticket-edit", "Administrar tickets"], ["postulaciones-panel", "Publicar postulaciones"],
      ["postulaciones-config", "Configurar preguntas"], ["giveaway", "Administrar sorteos"],
      ["lock", "Bloquear canal"], ["unlock", "Desbloquear canal"], ["slowmode", "Configurar modo lento"]
    ],
    utilidad: [
      ["ping", "Latencia del bot"], ["avatar", "Ver avatar"], ["serverinfo", "Información del servidor"], ["carrito", "Carrito y pedidos"], ["estadisticas-tienda", "Estadísticas de ventas"], ["resena", "Reseñas de clientes"], ["sugerencia", "Sugerencias de la comunidad"], ["userinfo", "Información de usuario"],
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
      ["giveaway", "Sorteos"], ["tienda", "Ver el catálogo"], ["ventas", "Contador de ventas"], ["help", "Centro de comandos"]
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
