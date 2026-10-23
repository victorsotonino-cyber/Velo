"use strict";
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
const { formatDuration } = require("./utils/command-helpers");
module.exports = {
  data: new SlashCommandBuilder().setName("botinfo").setDescription("Muestra información técnica y estadísticas de FLUX STORE."),
  async execute(i, client) {
    const user = client.user;
    const memory = process.memoryUsage();
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary || 0x8B5CF6)
      .setTitle("FLUX STORE • Información del bot")
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .setDescription("Datos de ejecución y estado del bot.")
      .addFields(
        { name: "Cuenta", value: user.tag, inline: true },
        { name: "ID", value: user.id, inline: true },
        { name: "Versión Node.js", value: process.version, inline: true },
        { name: "Servidores", value: String(client.guilds.cache.size), inline: true },
        { name: "Usuarios en caché", value: String(client.users.cache.size), inline: true },
        { name: "Comandos slash cargados", value: String(client.commands?.size || 0), inline: true },
        { name: "Tiempo activo", value: formatDuration(process.uptime() * 1000), inline: true },
        { name: "Memoria heap", value: (memory.heapUsed / 1024 / 1024).toFixed(1) + " MB", inline: true },
        { name: "Latencia de Gateway", value: client.ws.ping >= 0 ? client.ws.ping + " ms" : "No disponible", inline: true }
      ).setFooter({ text: "FLUX STORE • Estado del proceso actual" }).setTimestamp();
    return i.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
