const { PermissionFlagsBits, ChannelType } = require("discord.js");
const { readJSON, writeJSON } = require("./storage");
const config = require("./config");

const STATS_FILE = "flux-store-stats.json";
const PRODUCTS_FILE = "flux-store-products.json";
const VOUCHES_FILE = "flux-store-vouches.json";

function getStats() {
  const stats = readJSON(STATS_FILE, { sales: 8, legit: 12, legitVotes: {} });
  if (!Number.isFinite(Number(stats.sales))) stats.sales = 8;
  if (!Number.isFinite(Number(stats.legit))) stats.legit = 12;
  if (!stats.legitVotes || typeof stats.legitVotes !== "object" || Array.isArray(stats.legitVotes)) stats.legitVotes = {};
  stats.sales = Math.max(0, Math.floor(Number(stats.sales)));
  stats.legit = Math.max(0, Math.floor(Number(stats.legit)));
  return stats;
}

function saveStats(stats) {
  writeJSON(STATS_FILE, stats);
  return stats;
}

function getProducts() {
  const products = readJSON(PRODUCTS_FILE, []);
  return Array.isArray(products) ? products : [];
}

function saveProducts(products) {
  if (!Array.isArray(products)) throw new TypeError("El catálogo debe ser un array.");
  writeJSON(PRODUCTS_FILE, products);
  return products;
}

function isStoreStaff(member) {
  if (!member) return false;
  const permissions = member.permissions;
  if (permissions?.has(PermissionFlagsBits.Administrator) ||
      permissions?.has(PermissionFlagsBits.ManageGuild)) return true;

  const roleCache = member.roles?.cache;
  if (!roleCache) return false;
  return Boolean(
    (config.roles?.admin && roleCache.has(config.roles.admin)) ||
    (config.roles?.staff && roleCache.has(config.roles.staff))
  );
}

function voteLegit(userId, choice) {
  if (!["yes", "no"].includes(choice)) throw new TypeError("Opción de voto no válida.");
  const stats = getStats();
  const before = stats.legitVotes[String(userId)];
  if (before === choice) return { changed: false, count: stats.legit, choice };
  if (before === "yes") stats.legit = Math.max(0, stats.legit - 1);
  if (choice === "yes") stats.legit += 1;
  stats.legitVotes[String(userId)] = choice;
  saveStats(stats);
  return { changed: true, count: stats.legit, choice };
}

async function refreshCounters(guild) {
  if (!guild) return;
  const stats = getStats();
  const names = {
    sales: "🛒・ventas: " + stats.sales,
    legit: "✅・legit: " + stats.legit,
    members: "👥・miembros: " + guild.memberCount,
    bots: "🤖・bots: " + guild.members.cache.filter(member => member.user.bot).size
  };
  const voiceChannels = guild.channels.cache.filter(channel =>
    [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)
  );
  const prefixes = {
    sales: "🛒・ventas:",
    legit: "✅・legit:",
    members: "👥・miembros:",
    bots: "🤖・bots:"
  };
  for (const [key, name] of Object.entries(names)) {
    const channel = voiceChannels.find(candidate => candidate.name.startsWith(prefixes[key]));
    if (channel && channel.name !== name) await channel.setName(name).catch(() => {});
  }
}

async function addVouch(guild, record) {
  const stats = getStats();
  stats.sales += 1;
  saveStats(stats);
  const vouches = readJSON(VOUCHES_FILE, []);
  const records = Array.isArray(vouches) ? vouches : [];
  records.push({ ...record, guildId: guild.id, salesTotal: stats.sales, createdAt: new Date().toISOString() });
  writeJSON(VOUCHES_FILE, records.slice(-5000));
  await refreshCounters(guild);
  return stats;
}

function setSales(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) throw new TypeError("El total de ventas no es válido.");
  const stats = getStats();
  stats.sales = Math.floor(value);
  saveStats(stats);
  return stats;
}

function addSales(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) throw new TypeError("La cantidad de ventas no es válida.");
  const stats = getStats();
  stats.sales += Math.floor(value);
  saveStats(stats);
  return stats;
}

module.exports = {
  getStats, saveStats, getProducts, saveProducts, isStoreStaff,
  voteLegit, refreshCounters, addVouch, setSales, addSales
};
