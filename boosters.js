"use strict";
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
module.exports = {
  data: new SlashCommandBuilder().setName("boosters").setDescription("Muestra estadísticas de boosts y boosters visibles en caché."),
  async execute(i) {
    if (!i.guild) return i.reply({ content: "Este comando solo funciona en un servidor.", ephemeral: true });
    const boosters = i.guild.members.cache.filter(member => Boolean(member.premiumSince));
    const names = [...boosters.values()].sort((a, b) => (a.premiumSinceTimestamp || 0) - (b.premiumSinceTimestamp || 0))
      .slice(0, 20).map(member => "• " + member.toString() + " — desde <t:" + Math.floor(member.premiumSinceTimestamp / 1000) + ":D>");
    const embed = new EmbedBuilder().setColor(config.colors.primary || 0x8B5CF6)
      .setTitle("💎 " + i.guild.name + " • Boosters")
      .addFields(
        { name: "Boosts del servidor", value: String(i.guild.premiumSubscriptionCount ?? 0), inline: true },
        { name: "Boosters en caché", value: String(boosters.size), inline: true },
        { name: "Miembros que impulsan", value: names.join("\n").slice(0, 1024) || "No hay boosters en la caché actual.", inline: false }
      ).setFooter({ text: "La lista de miembros usa la caché disponible; el total de boosts procede del servidor." });
    return i.reply({ embeds: [embed], ephemeral: true, allowedMentions: { parse: [] } });
  }
};
