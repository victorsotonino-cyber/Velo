const { EmbedBuilder } = require("discord.js");
const { readJSON, writeJSON } = require("../storage");
const config = require("../config");

const POLLS_FILE = "flux-store-polls.json";
const SUGGESTIONS_FILE = "flux-store-suggestions.json";

function readList(file) {
  const value = readJSON(file, []);
  return Array.isArray(value) ? value : [];
}

function getPolls() { return readList(POLLS_FILE); }
function savePolls(rows) { writeJSON(POLLS_FILE, rows); return rows; }
function getSuggestions() { return readList(SUGGESTIONS_FILE); }
function saveSuggestions(rows) { writeJSON(SUGGESTIONS_FILE, rows); return rows; }

function buildPollEmbed(poll) {
  const voteMap = poll.votes && typeof poll.votes === "object" ? poll.votes : {};
  const counts = (poll.options || []).map((_, index) =>
    Object.values(voteMap).filter(value => Number(value) === index).length
  );
  const total = Object.keys(voteMap).length;
  const options = poll.options.map((option, index) =>
    "**" + (index + 1) + ". " + option + "** — " + counts[index] + (counts[index] === 1 ? " voto" : " votos")
  );
  return new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle("📊 Encuesta • FLUX STORE")
    .setDescription("**" + poll.question + "**\n\n" + options.join("\n"))
    .addFields({ name: "Participación", value: String(total) + (total === 1 ? " voto registrado" : " votos registrados"), inline: true })
    .setFooter({ text: "Encuesta #" + poll.id + " • Puedes cambiar tu voto." })
    .setTimestamp(new Date(poll.createdAt));
}

function buildSuggestionEmbed(suggestion) {
  const votes = suggestion.votes && typeof suggestion.votes === "object" ? suggestion.votes : {};
  const positive = Object.values(votes).filter(value => value === "up").length;
  const negative = Object.values(votes).filter(value => value === "down").length;
  const state = suggestion.status || "pendiente";
  return new EmbedBuilder()
    .setColor(state === "aceptada" ? config.colors.success : state === "rechazada" ? config.colors.error : config.colors.primary)
    .setTitle("💡 Sugerencia #" + suggestion.id + " • FLUX STORE")
    .setDescription(String(suggestion.text || "").slice(0, 3500))
    .addFields(
      { name: "Propuesta por", value: "<@" + suggestion.userId + ">", inline: true },
      { name: "Estado", value: state.charAt(0).toUpperCase() + state.slice(1), inline: true },
      { name: "👍 A favor", value: String(positive), inline: true },
      { name: "👎 En contra", value: String(negative), inline: true }
    )
    .setFooter({ text: "FLUX STORE • Cada persona puede cambiar su voto." })
    .setTimestamp(new Date(suggestion.createdAt));
}

function addPoll(poll) {
  const rows = getPolls();
  rows.push(poll);
  savePolls(rows.slice(-5000));
  return poll;
}

function setPollMessage(id, guildId, channelId, messageId) {
  const rows = getPolls();
  const poll = rows.find(row => row.id === id && row.guildId === guildId);
  if (!poll) return null;
  poll.channelId = channelId;
  poll.messageId = messageId;
  savePolls(rows);
  return poll;
}

function castPollVote({ id, guildId, channelId, messageId, userId, optionIndex }) {
  const rows = getPolls();
  const poll = rows.find(row => row.id === id && row.guildId === guildId && row.channelId === channelId && row.messageId === messageId);
  if (!poll) return { ok: false, message: "Esta encuesta ya no está disponible." };
  const index = Number(optionIndex);
  if (!Number.isInteger(index) || index < 0 || index >= poll.options.length) {
    return { ok: false, message: "La opción seleccionada no existe." };
  }
  poll.votes = poll.votes && typeof poll.votes === "object" ? poll.votes : {};
  const previous = poll.votes[userId];
  poll.votes[userId] = index;
  savePolls(rows);
  return {
    ok: true,
    poll,
    message: previous === index ? "Tu voto ya estaba registrado." : previous === undefined ? "Voto registrado." : "Tu voto se actualizó."
  };
}

function addSuggestion(suggestion) {
  const rows = getSuggestions();
  rows.push(suggestion);
  saveSuggestions(rows.slice(-5000));
  return suggestion;
}

function setSuggestionMessage(id, guildId, channelId, messageId) {
  const rows = getSuggestions();
  const suggestion = rows.find(row => row.id === id && row.guildId === guildId);
  if (!suggestion) return null;
  suggestion.channelId = channelId;
  suggestion.messageId = messageId;
  saveSuggestions(rows);
  return suggestion;
}

function castSuggestionVote({ id, guildId, channelId, messageId, userId, choice }) {
  if (!["up", "down"].includes(choice)) return { ok: false, message: "Tipo de voto inválido." };
  const rows = getSuggestions();
  const suggestion = rows.find(row => row.id === id && row.guildId === guildId &&
    row.channelId === channelId && row.messageId === messageId);
  if (!suggestion) return { ok: false, message: "Esta sugerencia ya no está disponible." };
  suggestion.votes = suggestion.votes && typeof suggestion.votes === "object" ? suggestion.votes : {};
  const previous = suggestion.votes[userId];
  if (previous === choice) delete suggestion.votes[userId];
  else suggestion.votes[userId] = choice;
  saveSuggestions(rows);
  return {
    ok: true,
    suggestion,
    message: previous === choice ? "Retiraste tu voto." : previous ? "Tu voto se actualizó." : "Voto registrado."
  };
}

module.exports = {
  getPolls, savePolls, getSuggestions, saveSuggestions, buildPollEmbed, buildSuggestionEmbed,
  addPoll, setPollMessage, castPollVote, addSuggestion, setSuggestionMessage, castSuggestionVote
};
