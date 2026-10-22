"use strict";

function formatDuration(milliseconds) {
  const total = Math.floor(Math.max(0, Number(milliseconds) || 0) / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const result = [];
  if (days) result.push(days + " d");
  if (hours || days) result.push(hours + " h");
  if (minutes || hours || days) result.push(minutes + " min");
  result.push(seconds + " s");
  return result.join(" ");
}

function parseHexColor(value) {
  const input = String(value || "").trim();
  if (!/^#?[0-9a-f]{6}$/i.test(input)) return null;
  return Number.parseInt(input.replace(/^#/, ""), 16);
}

function getTicketStats(channels) {
  const values = channels && typeof channels.values === "function"
    ? [...channels.values()]
    : Array.from(channels || []);
  const ownerIds = new Set();
  const categories = {};
  let total = 0;
  for (const channel of values) {
    if (!channel || typeof channel.topic !== "string") continue;
    const parts = channel.topic.split(":");
    if (parts[0] !== "VeloTicket" || !/^\d{17,20}$/.test(parts[1] || "") || !parts[2]) continue;
    total += 1;
    ownerIds.add(parts[1]);
    categories[parts[2]] = (categories[parts[2]] || 0) + 1;
  }
  return { total, uniqueOwners: ownerIds.size, categories };
}

function canManageRole(actor, botMember, role, guildOwnerId) {
  if (!actor || !botMember || !role || role.managed) return false;
  if (!Number.isFinite(role.position) || !Number.isFinite(botMember.roles?.highest?.position)) return false;
  if (role.position >= botMember.roles.highest.position) return false;
  if (actor.id === guildOwnerId) return true;
  if (!Number.isFinite(actor.roles?.highest?.position)) return false;
  return role.position < actor.roles.highest.position;
}

function isValidUnixSeconds(value) {
  if (!/^\d{1,10}$/.test(String(value || ""))) return false;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= 4102444800;
}

module.exports = { formatDuration, parseHexColor, getTicketStats, canManageRole, isValidUnixSeconds };
