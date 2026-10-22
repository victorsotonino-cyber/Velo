const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("./config");

const recentMessages = new Map();
const lastActions = new Map();
const strikes = new Map();

function enabled() {
  return String(process.env.AUTOMOD_ENABLED || "false").toLowerCase() === "true";
}

function numberFromEnv(name, fallback, min, max) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

module.exports = function attachAutomod(client) {
  client.on("messageCreate", async message => {
    if (!enabled() || !message.guild || !message.member || message.author.bot) return;
    if (message.member.permissions.has(PermissionFlagsBits.Administrator) ||
        message.member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

    const maxMessages = numberFromEnv("AUTOMOD_MAX_MESSAGES", 7, 4, 20);
    const windowMs = numberFromEnv("AUTOMOD_WINDOW_SECONDS", 7, 3, 30) * 1000;
    const timeoutMinutes = numberFromEnv("AUTOMOD_TIMEOUT_MINUTES", 2, 1, 60);
    const key = message.guild.id + ":" + message.author.id;
    const now = Date.now();
    const history = (recentMessages.get(key) || []).filter(timestamp => now - timestamp <= windowMs);
    history.push(now);
    recentMessages.set(key, history);

    if (history.length <= maxMessages) return;
    await message.delete().catch(() => {});

    const last = lastActions.get(key) || 0;
    if (now - last < 10000) return;
    lastActions.set(key, now);

    const count = (strikes.get(key) || 0) + 1;
    strikes.set(key, count);
    let timedOut = false;
    if (count >= 2 && message.member.moderatable) {
      await message.member.timeout(timeoutMinutes * 60000, "FLUX STORE Automod: exceso de mensajes en poco tiempo")
        .then(() => { timedOut = true; })
        .catch(error => console.error("Automod no pudo aplicar timeout:", error.message));
      strikes.set(key, 0);
    }

    const warning = await message.channel.send({
      content: timedOut
        ? "🛡️ " + message.author + " recibió timeout por spam repetido."
        : "🛡️ " + message.author + ", bajé el ritmo de mensajes para evitar spam. Si fue un error, espera un momento antes de continuar.",
      allowedMentions: { users: [message.author.id] }
    }).catch(() => null);
    if (warning) setTimeout(() => warning.delete().catch(() => {}), 8000);

    const log = message.guild.channels.cache.get(config.channels.logs);
    if (log?.isTextBased()) {
      const embed = new EmbedBuilder().setColor(timedOut ? config.colors.warning : config.colors.primary)
        .setTitle("🛡️ Automod · Antispam")
        .setDescription("**Miembro:** " + message.author.tag + " (" + message.author.id + ")\n**Canal:** " + message.channel.name + "\n**Mensajes en ventana:** " + history.length + "\n**Acción:** " + (timedOut ? "Timeout de " + timeoutMinutes + " min" : "Mensaje eliminado y advertencia"))
        .setTimestamp();
      await log.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
    }

    if (recentMessages.size > 5000) {
      for (const [entryKey, timestamps] of recentMessages.entries()) {
        if (!timestamps.length || now - timestamps[timestamps.length - 1] > 60000) {
          recentMessages.delete(entryKey);
          lastActions.delete(entryKey);
          strikes.delete(entryKey);
        }
      }
    }
  });
};
