"use strict";
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
module.exports = {
  data: new SlashCommandBuilder().setName("emoji-search").setDescription("Busca emojis personalizados por nombre.")
    .addStringOption(o => o.setName("nombre").setDescription("Texto que debe aparecer en el nombre del emoji").setRequired(true).setMaxLength(60)),
  async execute(i) {
    if (!i.guild) return i.reply({ content: "Este comando solo funciona en un servidor.", ephemeral: true });
    const query = i.options.getString("nombre").trim().toLowerCase();
    if (!query) return i.reply({ content: "Escribe un nombre o parte del nombre del emoji.", ephemeral: true });
    const results = [...i.guild.emojis.cache.values()]
      .filter(item => item.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 15);
    if (!results.length) return i.reply({ content: "No encontré emojis que coincidan con " + query + ".", ephemeral: true });
    const description = results.map(item => item.toString() + "  **" + item.name + "** · " + (item.animated ? "animado" : "estático")).join("\n").slice(0, 4000);
    const embed = new EmbedBuilder().setColor(config.colors.primary || 0x8B5CF6)
      .setTitle("🔎 Emojis encontrados: " + query)
      .setDescription(description)
      .setFooter({ text: "Coincidencias mostradas: " + results.length + " (máximo 15)." });
    return i.reply({ embeds: [embed], ephemeral: true, allowedMentions: { parse: [] } });
  }
};
