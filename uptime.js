"use strict";
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
const { formatDuration } = require("./utils/command-helpers");
module.exports = {
  data: new SlashCommandBuilder().setName("uptime").setDescription("Muestra cuánto tiempo lleva activo FLUX STORE."),
  async execute(i, client) {
    const uptimeMs = process.uptime() * 1000;
    const embed = new EmbedBuilder().setColor(config.colors.success || 0x22C55E)
      .setTitle("⏱️ FLUX STORE • Tiempo activo")
      .setDescription("Activo durante: " + formatDuration(uptimeMs))
      .addFields(
        { name: "Gateway", value: client.ws.ping >= 0 ? client.ws.ping + " ms" : "No disponible", inline: true },
        { name: "Último reinicio", value: "<t:" + Math.floor((Date.now() - uptimeMs) / 1000) + ":F>", inline: true }
      ).setTimestamp();
    return i.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
