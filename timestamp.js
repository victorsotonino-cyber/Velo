"use strict";
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
const { isValidUnixSeconds } = require("./utils/command-helpers");
module.exports = {
  data: new SlashCommandBuilder().setName("timestamp").setDescription("Convierte segundos Unix al formato de fecha de Discord.")
    .addStringOption(o => o.setName("segundos").setDescription("Timestamp Unix en segundos, por ejemplo 1790000000").setRequired(true).setMaxLength(10)),
  async execute(i) {
    const raw = i.options.getString("segundos").trim();
    if (!isValidUnixSeconds(raw)) return i.reply({ content: "Indica segundos Unix válidos entre 0 y 4102444800 (hasta el año 2100).", ephemeral: true });
    const seconds = Number(raw);
    const date = new Date(seconds * 1000);
    const embed = new EmbedBuilder().setColor(config.colors.primary || 0x8B5CF6)
      .setTitle("🕒 Timestamp para Discord")
      .setDescription("Fecha UTC: " + date.toISOString() + "\nFecha local: <t:" + seconds + ":F>")
      .addFields(
        { name: "Fecha y hora", value: "<t:" + seconds + ":F>", inline: true },
        { name: "Fecha corta", value: "<t:" + seconds + ":d>", inline: true },
        { name: "Hora", value: "<t:" + seconds + ":t>", inline: true },
        { name: "Relativo", value: "<t:" + seconds + ":R>", inline: true },
        { name: "Código para copiar", value: "t:" + seconds + ":F", inline: false }
      ).setFooter({ text: "La visualización se adapta a la zona horaria de cada miembro." });
    return i.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
