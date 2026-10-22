"use strict";
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
module.exports = {
  data: new SlashCommandBuilder().setName("membercount").setDescription("Muestra estadísticas de miembros y boosts de la comunidad."),
  async execute(i) {
    if (!i.guild) return i.reply({ content: "Este comando solo funciona en un servidor.", ephemeral: true });
    const cached = i.guild.members.cache;
    const cachedBots = cached.filter(member => member.user.bot).size;
    const cachedHumans = cached.size - cachedBots;
    const embed = new EmbedBuilder().setColor(config.colors.primary || 0x8B5CF6)
      .setTitle("👥 " + i.guild.name + " • Miembros").setThumbnail(i.guild.iconURL({ size: 256 }))
      .addFields(
        { name: "Total de miembros", value: String(i.guild.memberCount), inline: true },
        { name: "Humanos en caché", value: String(cachedHumans), inline: true },
        { name: "Bots en caché", value: String(cachedBots), inline: true },
        { name: "Impulsos del servidor", value: String(i.guild.premiumSubscriptionCount ?? 0), inline: true },
        { name: "Nivel de boosts", value: String(i.guild.premiumTier), inline: true }
      ).setFooter({ text: "Humanos y bots usan la caché; el total procede del servidor." }).setTimestamp();
    return i.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
