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
  if (!stats.legitVotes || typeof stats.legitVotes !== "object") stats.legitVotes = {};
  stats.sales = Math.max(0, Math.floor(Number(stats.sales)));
  stats.legit = Math.max(0, Math.floor(Number(stats.legit)));
  return stats;
}
function saveStats(stats) { writeJSON(STATS_FILE, stats); return stats; }
function getProducts() { const p = readJSON(PRODUCTS_FILE, []); return Array.isArray(p) ? p : []; }
function saveProducts(products) { writeJSON(PRODUCTS_FILE, products); return products; }
function isStoreStaff(member) {
  if (!member) return false;
  const p = member.permissions;
  if (p?.has(PermissionFlagsBits.Administrator) || p?.has(PermissionFlagsBits.ManageGuild)) return true;
  const roles = member.roles?.cache;
  return Boolean(roles && ((config.roles?.admin && roles.has(config.roles.admin)) || (config.roles?.staff && roles.has(config.roles.staff))));
}
function voteLegit(userId, choice) {
  const stats = getStats(), before = stats.legitVotes[String(userId)];
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
    bots: "🤖・bots: " + guild.members.cache.filter(m => m.user.bot).size
  };
  const voiceChannels = guild.channels.cache.filter(c => [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(c.type) && c.topic?.startsWith("flux-counter:"));
  for (const [key, name] of Object.entries(names)) {
    const ch = voiceChannels.find(c => c.topic === "flux-counter:" + key);
    if (ch && ch.name !== name) await ch.setName(name).catch(() => {});
  }
}
async function addVouch(guild, record) {
  const stats = getStats();
  stats.sales += 1; saveStats(stats);
  const vouches = readJSON(VOUCHES_FILE, []);
  vouches.push({ ...record, guildId: guild.id, salesTotal: stats.sales, createdAt: new Date().toISOString() });
  writeJSON(VOUCHES_FILE, vouches.slice(-5000));
  await refreshCounters(guild);
  return stats;
}
function setSales(amount) { const s = getStats(); s.sales = Math.max(0, Math.floor(Number(amount))); saveStats(s); return s; }
function addSales(amount) { const s = getStats(); s.sales = Math.max(0, s.sales + Math.floor(Number(amount))); saveStats(s); return s; }
module.exports = { getStats, saveStats, getProducts, saveProducts, isStoreStaff, voteLegit, refreshCounters, addVouch, setSales, addSales };
