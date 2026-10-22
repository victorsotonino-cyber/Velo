const { PermissionFlagsBits } = require("discord.js");
const config = require("../config");

const recentMessages = new Map();
const WINDOW_MS = 7000;
const VIOLATION_COOLDOWN_MS = 15000;
const VIOLATION_MEMORY_MS = 10 * 60 * 1000;

function settingInt(name, fallback, min, max) {
  const value = Number.parseInt(process.env[name] || "", 10);
  return Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function isTrusted(member) {
  return Boolean(member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    member?.permissions?.has(PermissionFlagsBits.ManageMessages) ||
    member?.permissions?.has(PermissionFlagsBits.ManageGuild));
}

async function logModeration(guild, text) {
  const channel = guild.channels.cache.get(config.channels.logs);
  if (channel?.isTextBased()) {
    await channel.send({ content: text, allowedMentions: { parse: [] } }).catch(() => {});
  }
}

async function handle(message, prefix) {
  if (String(process.env.AUTOMOD_ENABLED || "true").toLowerCase() === "false") return false;
  if (!message.guild || message.author.bot || !message.member) return false;
  const content = String(message.content || "").trim();
  if (!content || content.startsWith(prefix) || /^\+vouch(?:\s|$)/i.test(content)) return false;
  if (isTrusted(message.member)) return false;

  const now = Date.now();
  const key = message.guild.id + ":" + message.author.id;
  const bucket = recentMessages.get(key) || {
    timestamps: [],
    previousNormalized: "",
    duplicateCount: 0,
    violations: [],
    lastViolationAt: 0
  };

  bucket.timestamps = bucket.timestamps.filter(timestamp => now - timestamp < WINDOW_MS);
  bucket.timestamps.push(now);
  const normalized = content.toLowerCase().replace(/https?:\/\/\S+/g, "<url>").replace(/\s+/g, " ").slice(0, 500);
  if (normalized && normalized === bucket.previousNormalized) bucket.duplicateCount += 1;
  else bucket.duplicateCount = 1;
  bucket.previousNormalized = normalized;

  const maxMessages = settingInt("AUTOMOD_MAX_MESSAGES", 5, 3, 20);
  const blockInvites = process.env.AUTOMOD_BLOCK_INVITES === "true";
  const inviteDetected = blockInvites && /(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)[a-z0-9-]+/i.test(content);
  const spamDetected = bucket.timestamps.length > maxMessages || bucket.duplicateCount >= 4;
  recentMessages.set(key, bucket);
  if (!inviteDetected && !spamDetected) return false;

  await message.delete().catch(() => {});
  const newViolationWindow = now - bucket.lastViolationAt > VIOLATION_COOLDOWN_MS;
  if (newViolationWindow) {
    bucket.violations = bucket.violations.filter(timestamp => now - timestamp < VIOLATION_MEMORY_MS);
    bucket.violations.push(now);
    bucket.lastViolationAt = now;
  }
  recentMessages.set(key, bucket);

  const timeoutMinutes = settingInt("AUTOMOD_TIMEOUT_MINUTES", 5, 1, 60);
  let timedOut = false;
  if (bucket.violations.length >= 2 && message.member.moderatable) {
    try {
      await message.member.timeout(timeoutMinutes * 60 * 1000, "Automod FLUX STORE: spam reiterado");
      timedOut = true;
      bucket.violations = [];
      recentMessages.set(key, bucket);
    } catch (error) {
      console.error("Automod no pudo aplicar timeout a " + message.author.tag + ":", error?.message || error);
    }
  }

  if (newViolationWindow) {
    const warning = timedOut
      ? "🛡️ <@" + message.author.id + ">, se te aplicó un timeout de " + timeoutMinutes + " min por reincidir en spam."
      : "⚠️ <@" + message.author.id + ">, eliminé un mensaje por spam o contenido no permitido. Si se repite, se aplicará una sanción.";
    await message.channel.send({ content: warning, allowedMentions: { users: [message.author.id] } })
      .then(sent => setTimeout(() => sent.delete().catch(() => {}), 7000))
      .catch(() => {});
    await logModeration(message.guild,
      "🛡️ Automod • Usuario: " + message.author.tag + " (" + message.author.id + ")" +
      " • Canal: #" + message.channel.name +
      " • Motivo: " + (inviteDetected ? "enlace de invitación" : "spam") +
      " • Acción: " + (timedOut ? "timeout " + timeoutMinutes + " min" : "mensaje eliminado"));
  }
  return true;
}

module.exports = { handle };
