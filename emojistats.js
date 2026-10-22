"use strict";
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
module.exports = {
  data: new SlashCommandBuilder().setName("emojistats").setDescription("Muestra estadísticas y ejemplos de los emojis del servidor."),
  async execute(i) {
    if (!i.guild) return i.reply({ content: "Este comando solo funciona en un servidor.", ephemeral: true });
    const emojis = [...i.guild.emojis.cache.values()];
    const animated = emojis.filter(emoji => emoji.animated);
    const regular = emojis.length - animated.length;
    const examples = emojis.slice(0, 18).map(emoji => emoji.toString()).join(" ");
    const embed = new EmbedBuilder().setColor(config.colors.primary || 0x8B5CF6)
      .setTitle("✨ " + i.guild.name + " • Emojis")
      .addFields(
        { name: "Total en caché", value: String(emojis.length), inline: true },
        { name: "Estáticos", value: String(regular), inline: true },
        { name: "Animados", value: String(animated.length), inline: true },
        { name: "Ejemplos", value: examples || "No hay emojis personalizados en la caché.", inline: false }
      ).setFooter({ text: "Las cuotas de emojis dependen de las características actuales del servidor." });
    return i.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
