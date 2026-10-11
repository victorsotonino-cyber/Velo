const crypto = require("crypto");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { readJSON, writeJSON } = require("./storage");
const config = require("./config");
const { emoji, emojiData } = require("./ui");

const STORE = "giveaways.json";
const timers = new Map();
const MAX_TIMEOUT = 2_147_000_000;
const MAX_DURATION = 90 * 24 * 60 * 60 * 1000;

function allGiveaways() {
  const value = readJSON(STORE, []);
  return Array.isArray(value) ? value : [];
}
function persist(giveaways) { writeJSON(STORE, giveaways); }
function saveGiveaway(giveaway) {
  const list = allGiveaways();
  const index = list.findIndex(item => item.messageId === giveaway.messageId);
  if (index === -1) list.push(giveaway);
  else list[index] = giveaway;
  persist(list);
}
function findGiveaway(id, guildId) {
  return allGiveaways().find(item =>
    (item.messageId === String(id) || item.id === String(id)) &&
    (!guildId || item.guildId === String(guildId))
  ) || null;
}
function activeForGuild(guildId) {
  return allGiveaways().filter(item => item.guildId === String(guildId) && item.status === "active").sort((a, b) => a.endAt - b.endAt);
}
function parseDuration(input) {
  const match = String(input || "").trim().match(/^(\d{1,6})\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)$/i);
  if (!match) return { error: "Duración no válida. Usa por ejemplo 30m, 2h, 1d o 1w." };
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier =
    ["s", "sec", "secs", "second", "seconds"].includes(unit) ? 1000 :
    ["m", "min", "mins", "minute", "minutes"].includes(unit) ? 60_000 :
    ["h", "hr", "hrs", "hour", "hours"].includes(unit) ? 3_600_000 :
    ["d", "day", "days"].includes(unit) ? 86_400_000 : 604_800_000;
  const ms = amount * multiplier;
  if (!Number.isFinite(ms) || ms < 60_000) return { error: "El sorteo debe durar al menos 1 minuto." };
  if (ms > MAX_DURATION) return { error: "La duración máxima es de 90 días." };
  return { ms };
}
function buildEmbed(giveaway, guild) {
  const active = giveaway.status === "active";
  const ended = giveaway.status === "ended";
  const color = active ? config.colors.primary : ended ? config.colors.success : config.colors.error;
  const roleLine = giveaway.requiredRoleId ? "\n\n**Requisito:** tener el rol <@&" + giveaway.requiredRoleId + ">." : "";
  const detail = active
    ? "Pulsa **Participar / salir** para entrar o retirar tu participación."
    : ended
      ? (giveaway.winners?.length ? "**Ganadores:** " + giveaway.winners.map(id => "<@" + id + ">").join(", ") : "No hubo participantes elegibles para este sorteo.")
      : "Este sorteo fue cancelado por el equipo de administración.";
  const description = [giveaway.description || "", detail].filter(Boolean).join("\n\n");
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle((ended ? "🏆 " : giveaway.status === "cancelled" ? "⛔ " : emoji(guild, "velo_giveaway", "🎉") + " ") +
      (active ? "SORTEO ACTIVO" : ended ? "SORTEO FINALIZADO" : "SORTEO CANCELADO"))
    .setDescription(("## " + giveaway.prize + "\n" + description + roleLine).slice(0, 4000))
    .addFields(
      { name: emoji(guild, "velo_gift", "🎁") + " Premio", value: giveaway.prize.slice(0, 1024), inline: true },
      { name: "🏆 Ganadores", value: String(giveaway.winnerCount), inline: true },
      { name: "👥 Participantes", value: String(giveaway.participants.length), inline: true },
      { name: "👤 Organizador", value: "<@" + giveaway.hostId + ">", inline: true }
    )
    .setFooter({ text: "Velo Studio • Giveaway ID: " + giveaway.messageId })
    .setTimestamp(new Date(giveaway.createdAt));
  if (active) {
    embed.addFields({ name: "⏳ Finaliza", value: "<t:" + Math.floor(giveaway.endAt / 1000) + ":F>\n(<t:" + Math.floor(giveaway.endAt / 1000) + ":R>)", inline: true });
  } else {
    embed.addFields({
      name: ended ? "✅ Finalizado" : "⛔ Cancelado",
      value: "<t:" + Math.floor((giveaway.endedAt || giveaway.cancelledAt || Date.now()) / 1000) + ":F>",
      inline: true
    });
  }
  if (giveaway.requiredRoleId) embed.addFields({ name: "🔐 Rol necesario", value: "<@&" + giveaway.requiredRoleId + ">", inline: true });
  if (guild?.iconURL()) embed.setThumbnail(guild.iconURL({ size: 256 }));
  return embed;
}
function buildComponents(guild, giveaway) {
  const active = giveaway.status === "active";
  const button = new ButtonBuilder()
    .setCustomId("giveaway:join:" + giveaway.messageId)
    .setLabel(active ? "Participar / salir" : giveaway.status === "ended" ? "Sorteo finalizado" : "Sorteo cancelado")
    .setStyle(active ? ButtonStyle.Success : ButtonStyle.Secondary)
    .setEmoji(emojiData(guild, "velo_giveaway", "🎉"))
    .setDisabled(!active);
  return [new ActionRowBuilder().addComponents(button)];
}
async function fetchMessage(client, giveaway) {
  const guild = client.guilds.cache.get(giveaway.guildId) || await client.guilds.fetch(giveaway.guildId).catch(() => null);
  if (!guild) return { guild: null, channel: null, message: null };
  const channel = guild.channels.cache.get(giveaway.channelId) || await guild.channels.fetch(giveaway.channelId).catch(() => null);
  if (!channel?.isTextBased() || !channel.messages) return { guild, channel, message: null };
  return { guild, channel, message: await channel.messages.fetch(giveaway.messageId).catch(() => null) };
}
async function updateMessage(client, giveaway) {
  const { guild, message } = await fetchMessage(client, giveaway);
  if (!guild || !message) {
    console.warn("No se pudo actualizar el mensaje del sorteo " + giveaway.messageId + " (mensaje o canal no disponible).");
    return false;
  }
  let content = "";
  if (giveaway.status === "ended") {
    const latest = giveaway.latestWinners || giveaway.winners || [];
    content = latest.length
      ? "🎉 **¡Sorteo finalizado!** " + latest.map(id => "<@" + id + ">").join(" ") + ((giveaway.rerollCount || 0) ? " — nuevos ganadores del reroll." : " — felicidades.")
      : "🎉 **Sorteo finalizado:** no hubo participantes elegibles.";
  } else if (giveaway.status === "cancelled") content = "⛔ **Este sorteo ha sido cancelado.**";
  await message.edit({
    content,
    embeds: [buildEmbed(giveaway, guild)],
    components: buildComponents(guild, giveaway),
    allowedMentions: { users: giveaway.status === "ended" ? (giveaway.latestWinners || giveaway.winners || []) : [] }
  });
  return true;
}
function cancelTimer(id) {
  const timer = timers.get(String(id));
  if (timer) clearTimeout(timer);
  timers.delete(String(id));
}
function schedule(client, giveaway) {
  cancelTimer(giveaway.messageId);
  if (giveaway.status !== "active") return;
  const wait = Math.max(0, giveaway.endAt - Date.now());
  const timer = setTimeout(async () => {
    timers.delete(giveaway.messageId);
    const current = findGiveaway(giveaway.messageId, giveaway.guildId);
    if (!current || current.status !== "active") return;
    if (current.endAt > Date.now()) return schedule(client, current);
    await finishGiveaway(client, current.guildId, current.messageId, { force: false });
  }, Math.min(wait, MAX_TIMEOUT));
  if (typeof timer.unref === "function") timer.unref();
  timers.set(giveaway.messageId, timer);
}
function chooseWinners(participants, count, excluded = []) {
  const excludedSet = new Set(excluded);
  const pool = [...new Set(participants)].filter(id => !excludedSet.has(id));
  const winners = [];
  while (pool.length && winners.length < count) {
    const index = crypto.randomInt(0, pool.length);
    winners.push(pool.splice(index, 1)[0]);
  }
  return winners;
}
async function createGiveaway(client, options) {
  const { guild, channel, host, prize, description = "", winnerCount = 1, durationMs, requiredRoleId = null } = options;
  if (!guild || !channel?.isTextBased() || !channel.messages) throw new Error("El canal de destino no acepta mensajes.");
  if (!Number.isFinite(durationMs) || durationMs < 60_000 || durationMs > MAX_DURATION) throw new Error("La duración no está dentro del rango permitido.");
  if (!String(prize || "").trim()) throw new Error("Debes indicar un premio.");
  if (!Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > 20) throw new Error("El número de ganadores debe estar entre 1 y 20.");
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me) throw new Error("No pude comprobar los permisos del bot en este servidor.");
  const permissions = channel.permissionsFor(me);
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory])) {
    throw new Error("Me faltan permisos en " + channel + ": Ver canal, Enviar mensajes, Insertar enlaces e Historial de mensajes.");
  }
  if (requiredRoleId && !guild.roles.cache.has(requiredRoleId)) throw new Error("El rol requerido no existe en este servidor.");
  const placeholder = await channel.send({ content: emoji(guild, "velo_giveaway", "🎉") + " Preparando sorteo...", allowedMentions: { parse: [] } });
  const now = Date.now();
  const giveaway = {
    id: placeholder.id, messageId: placeholder.id, guildId: guild.id, channelId: channel.id, hostId: host.id,
    prize: String(prize).trim().slice(0, 250), description: String(description).trim().slice(0, 1500),
    winnerCount, durationMs, requiredRoleId: requiredRoleId || null, createdAt: now, endAt: now + durationMs,
    status: "active", participants: [], winners: [], latestWinners: [], rerollCount: 0
  };
  try {
    saveGiveaway(giveaway);
    await placeholder.edit({ content: "", embeds: [buildEmbed(giveaway, guild)], components: buildComponents(guild, giveaway), allowedMentions: { parse: [] } });
  } catch (error) {
    cancelTimer(giveaway.messageId);
    persist(allGiveaways().filter(item => item.messageId !== giveaway.messageId));
    await placeholder.delete().catch(() => {});
    throw error;
  }
  schedule(client, giveaway);
  return giveaway;
}
async function finishGiveaway(client, guildId, messageId, options = {}) {
  const giveaway = findGiveaway(messageId, guildId);
  if (!giveaway || giveaway.status !== "active") return { ok: false, reason: "not_active", giveaway };
  if (!options.force && giveaway.endAt > Date.now()) {
    schedule(client, giveaway);
    return { ok: false, reason: "not_due", giveaway };
  }
  const winners = chooseWinners(giveaway.participants, giveaway.winnerCount);
  giveaway.status = "ended";
  giveaway.endedAt = Date.now();
  giveaway.winners = winners;
  giveaway.latestWinners = winners;
  saveGiveaway(giveaway);
  cancelTimer(giveaway.messageId);
  await updateMessage(client, giveaway).catch(error => console.error("No se pudo actualizar sorteo:", error));
  return { ok: true, giveaway };
}
async function cancelGiveaway(client, guildId, messageId) {
  const giveaway = findGiveaway(messageId, guildId);
  if (!giveaway || giveaway.status !== "active") return { ok: false, reason: "not_active", giveaway };
  giveaway.status = "cancelled";
  giveaway.cancelledAt = Date.now();
  saveGiveaway(giveaway);
  cancelTimer(giveaway.messageId);
  await updateMessage(client, giveaway).catch(error => console.error("No se pudo actualizar sorteo cancelado:", error));
  return { ok: true, giveaway };
}
async function rerollGiveaway(client, guildId, messageId, winnerCount = 1) {
  const giveaway = findGiveaway(messageId, guildId);
  if (!giveaway || giveaway.status !== "ended") return { ok: false, reason: "not_ended", giveaway };
  if (!Number.isInteger(winnerCount) || winnerCount < 1 || winnerCount > 20) return { ok: false, reason: "invalid_count", giveaway };
  const winners = chooseWinners(giveaway.participants, winnerCount, giveaway.winners || []);
  if (!winners.length) return { ok: false, reason: "no_candidates", giveaway };
  giveaway.winners = [...(giveaway.winners || []), ...winners];
  giveaway.latestWinners = winners;
  giveaway.rerollCount = (giveaway.rerollCount || 0) + 1;
  giveaway.lastRerollAt = Date.now();
  saveGiveaway(giveaway);
  await updateMessage(client, giveaway).catch(error => console.error("No se pudo actualizar reroll:", error));
  return { ok: true, giveaway, winners };
}
async function toggleParticipation(interaction, client, messageId) {
  const giveaway = findGiveaway(messageId, interaction.guildId);
  if (!giveaway) return { ok: false, message: "No encuentro ese sorteo en mi registro." };
  if (giveaway.status !== "active" || giveaway.endAt <= Date.now()) {
    if (giveaway.status === "active") await finishGiveaway(client, giveaway.guildId, giveaway.messageId);
    return { ok: false, message: "Este sorteo ya terminó o no admite más participaciones." };
  }
  if (interaction.user.bot) return { ok: false, message: "Las cuentas de bot no pueden participar." };
  if (giveaway.requiredRoleId) {
    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    if (!member?.roles.cache.has(giveaway.requiredRoleId)) {
      return { ok: false, message: "Para participar necesitas el rol <@&" + giveaway.requiredRoleId + ">." };
    }
  }
  const userId = interaction.user.id;
  const existing = giveaway.participants.includes(userId);
  giveaway.participants = existing ? giveaway.participants.filter(id => id !== userId) : [...giveaway.participants, userId];
  giveaway.updatedAt = Date.now();
  saveGiveaway(giveaway);
  await updateMessage(client, giveaway).catch(error => console.error("No se pudo refrescar sorteo:", error));
  return {
    ok: true, joined: !existing,
    message: existing ? "Has retirado tu participación del sorteo." :
      emoji(interaction.guild, "success", "✅") + " Ya participas en " + giveaway.prize + "."
  };
}
function restore(client) {
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  const active = allGiveaways().filter(item => item.status === "active");
  for (const giveaway of active) schedule(client, giveaway);
  console.log("Giveaways restaurados:", active.length);
}
async function executePrefix(message, args, client) {
  const action = String(args[0] || "help").toLowerCase();
  const isAdmin = message.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
  const reply = text => message.reply({ content: text, allowedMentions: { parse: [] } });
  if (!isAdmin) return reply(emoji(message.guild, "error", "❌") + " Necesitas Gestionar servidor para administrar sorteos.");
  if (["help", "ayuda"].includes(action)) {
    return reply("🎉 Velo Studio • Giveaways\n" +
      "!giveaway start [#canal] duración ganadores premio | descripción\n" +
      "!giveaway end ID · !giveaway cancel ID · !giveaway reroll ID [ganadores] · !giveaway list\n" +
      "Duraciones: 30m, 2h, 1d, 1w (máximo 90 días).");
  }
  if (["start", "crear", "create"].includes(action)) {
    let raw = args.slice(1).join(" ").trim();
    const targetChannel = message.mentions.channels.first() || message.channel;
    raw = raw.replace(/<#\d{17,20}>/g, "").trim();
    const match = raw.match(/^(\S+)\s+(\d+)\s+([\s\S]+)$/);
    if (!match) return reply("Uso: !giveaway start [#canal] 1h 1 Premio | descripción opcional");
    const duration = parseDuration(match[1]);
    if (duration.error) return reply(duration.error);
    const winners = Number(match[2]);
    if (!Number.isInteger(winners) || winners < 1 || winners > 20) return reply("Los ganadores deben ser un número entre 1 y 20.");
    const [prize, description = ""] = match[3].split("|");
    if (!prize.trim()) return reply("Indica el premio del sorteo.");
    try {
      const giveaway = await createGiveaway(client, {
        guild: message.guild, channel: targetChannel, host: message.author, prize: prize.trim(),
        description: description.trim(), winnerCount: winners, durationMs: duration.ms
      });
      return reply("✅ Sorteo creado: https://discord.com/channels/" + giveaway.guildId + "/" + giveaway.channelId + "/" + giveaway.messageId + "\nID: " + giveaway.messageId);
    } catch (error) {
      console.error("Error en !giveaway start:", error);
      return reply("❌ No pude crear el sorteo: " + String(error.message || error).slice(0, 500));
    }
  }
  if (["list", "lista"].includes(action)) {
    const active = activeForGuild(message.guild.id);
    if (!active.length) return reply("No hay sorteos activos en este servidor.");
    const lines = active.slice(0, 15).map(g =>
      "• **" + g.prize + "** — <#" + g.channelId + "> · termina <t:" + Math.floor(g.endAt / 1000) + ":R> · ID " + g.messageId
    );
    return message.reply({
      embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle("🎉 Sorteos activos").setDescription(lines.join("\n"))],
      allowedMentions: { parse: [] }
    });
  }
  const id = String(args[1] || "").replace(/[<#>]/g, "");
  if (!id) return reply("Debes indicar el ID del mensaje del sorteo. Usa !giveaway list para ver los activos.");
  if (["end", "terminar", "finish"].includes(action)) {
    const result = await finishGiveaway(client, message.guild.id, id, { force: true });
    return reply(result.ok ? "🏁 Sorteo finalizado. ID: " + id : "No pude finalizarlo: no existe o ya no está activo.");
  }
  if (["cancel", "cancelar"].includes(action)) {
    const result = await cancelGiveaway(client, message.guild.id, id);
    return reply(result.ok ? "⛔ Sorteo cancelado." : "No existe o ya no está activo.");
  }
  if (["reroll", "resortear"].includes(action)) {
    const count = args[2] === undefined ? 1 : Number(args[2]);
    const result = await rerollGiveaway(client, message.guild.id, id, count);
    return reply(result.ok
      ? "🎉 Nuevos ganadores: " + result.winners.map(user => "<@" + user + ">").join(" ")
      : result.reason === "no_candidates" ? "No quedan participantes sin premio para volver a sortear." :
        "No pude hacer reroll. Comprueba que el sorteo haya terminado y el ID sea correcto.");
  }
  return reply("Subcomando desconocido. Usa !giveaway help.");
}
module.exports = {
  parseDuration, createGiveaway, finishGiveaway, cancelGiveaway, rerollGiveaway,
  toggleParticipation, restore, findGiveaway, activeForGuild, executePrefix, buildEmbed, buildComponents
};
