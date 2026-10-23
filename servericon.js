"use strict";
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
module.exports = {
  data: new SlashCommandBuilder().setName("servericon").setDescription("Muestra el icono del servidor en tamaño grande."),
  async execute(i) {
    if (!i.guild) return i.reply({ content: "Este comando solo funciona en un servidor.", ephemeral: true });
    const iconURL = i.guild.iconURL({ size: 1024 });
    if (!iconURL) return i.reply({ content: "Este servidor no tiene un icono configurado.", ephemeral: true });
    const embed = new EmbedBuilder().setColor(config.colors.primary || 0x8B5CF6)
      .setTitle("Icono de " + i.guild.name).setImage(iconURL);
    return i.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
