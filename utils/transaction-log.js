"use strict";

const config = require("../config");

/**
 * Publishes purchase/order events in the configured FLUX STORE transaction channel.
 * The channel ID is configurable; no Discord user/role mentions are triggered by default.
 */
async function sendTransactionLog(guild, payload, label) {
  const channelId = config.channels.transactions || config.channels.logs;
  if (!guild || !channelId || !guild.channels || typeof guild.channels.fetch !== "function") {
    return false;
  }

  const channel = await guild.channels.fetch(channelId).catch(function (error) {
    console.error("No se pudo acceder al canal de transacciones " + channelId + ":", error && error.message ? error.message : error);
    return null;
  });

  if (!channel || typeof channel.isTextBased !== "function" || !channel.isTextBased() || typeof channel.send !== "function") {
    console.error("El canal de transacciones " + channelId + " no existe o no admite mensajes.");
    return false;
  }

  try {
    await channel.send({
      ...payload,
      allowedMentions: payload && payload.allowedMentions ? payload.allowedMentions : { parse: [] }
    });
    return true;
  } catch (error) {
    console.error("No se pudo publicar " + (label || "la transacción") + " en el canal " + channelId + ":", error && error.message ? error.message : error);
    return false;
  }
}

module.exports = { sendTransactionLog };
