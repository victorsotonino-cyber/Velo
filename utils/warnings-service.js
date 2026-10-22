"use strict";
const { readJSON, writeJSON } = require("../storage");
const FILE = "flux-store-warnings.json";
function loadStore() {
  const value = readJSON(FILE, { nextId: 1, entries: [] });
  if (Array.isArray(value)) return { nextId: value.length + 1, entries: value };
  return {
    nextId: Number.isSafeInteger(value?.nextId) && value.nextId > 0 ? value.nextId : 1,
    entries: Array.isArray(value?.entries) ? value.entries : []
  };
}
function addWarning(record) {
  if (!record?.guildId || !record?.userId || !record?.moderatorId) throw new TypeError("guildId, userId and moderatorId are required.");
  const store = loadStore();
  const entry = {
    id: "W" + String(store.nextId).padStart(6, "0"),
    guildId: String(record.guildId),
    userId: String(record.userId),
    moderatorId: String(record.moderatorId),
    moderatorTag: String(record.moderatorTag || "Staff"),
    reason: String(record.reason || "Sin motivo indicado").slice(0, 500),
    createdAt: new Date().toISOString()
  };
  store.nextId += 1;
  store.entries.push(entry);
  if (store.entries.length > 5000) store.entries = store.entries.slice(-5000);
  writeJSON(FILE, store);
  return entry;
}
function listWarnings(guildId, userId) {
  return loadStore().entries.filter(entry => entry.guildId === String(guildId) && entry.userId === String(userId))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
function clearWarnings(guildId, userId) {
  const store = loadStore();
  const before = store.entries.length;
  store.entries = store.entries.filter(entry => !(entry.guildId === String(guildId) && entry.userId === String(userId)));
  const removed = before - store.entries.length;
  if (removed) writeJSON(FILE, store);
  return removed;
}
module.exports = { addWarning, listWarnings, clearWarnings };
