"use strict";

const { readJSON, writeJSON } = require("./storage");

const FILE = "guild-settings.json";
const DEFAULTS = Object.freeze({
  welcomeChannelId: null,
  logsChannelId: null,
  autoroleId: null,
  automodEnabled: null,
  auditEnabled: true
});
const ALLOWED_KEYS = new Set(Object.keys(DEFAULTS));

function readAll() {
  const value = readJSON(FILE, {});
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function getGuildSettings(guildId) {
  if (!guildId) return { ...DEFAULTS };
  const saved = readAll()[String(guildId)];
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return { ...DEFAULTS };
  return { ...DEFAULTS, ...saved };
}

function updateGuildSettings(guildId, patch) {
  if (!/^\d{17,20}$/.test(String(guildId || ""))) {
    throw new TypeError("guildId no es un ID de servidor válido.");
  }
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw new TypeError("La configuración debe ser un objeto.");
  }

  const all = readAll();
  const key = String(guildId);
  const current = { ...DEFAULTS, ...(all[key] || {}) };

  for (const [name, value] of Object.entries(patch)) {
    if (!ALLOWED_KEYS.has(name)) throw new TypeError("Ajuste no permitido: " + name);

    if (name.endsWith("ChannelId") || name === "autoroleId") {
      if (value !== null && value !== undefined && !/^\d{17,20}$/.test(String(value))) {
        throw new TypeError(name + " debe ser un ID válido o null.");
      }
      current[name] = value == null ? null : String(value);
      continue;
    }

    if (name === "automodEnabled") {
      if (value !== null && typeof value !== "boolean") {
        throw new TypeError("automodEnabled debe ser true, false o null.");
      }
      current[name] = value;
      continue;
    }

    if (name === "auditEnabled") {
      if (typeof value !== "boolean") throw new TypeError("auditEnabled debe ser booleano.");
      current[name] = value;
    }
  }

  all[key] = current;
  writeJSON(FILE, all);
  return { ...current };
}

module.exports = {
  DEFAULTS,
  getGuildSettings,
  updateGuildSettings
};
