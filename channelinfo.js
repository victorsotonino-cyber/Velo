"use strict";
const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require("discord.js");
const config = require("./config");
const CHANNEL_TYPES = {
  [ChannelType.GuildText]: "Texto",
  [ChannelType.GuildVoice]: "Voz",
  [ChannelType.GuildCategory]: "Categoría",
  [ChannelType.GuildAnnouncement]: "Anuncios",
  [ChannelType.AnnouncementThread]: "Hilo de anuncio",
  [ChannelType.PublicThread]: "Hilo público",
  [ChannelType.PrivateThread]: "Hilo privado",
  [ChannelType.GuildStageVoice]: "Escenario",
  [ChannelType.GuildForum]: "Foro"
};
module.exports = {
  data: new SlashCommandBuilder().setName("channelinfo").setDescription("Muestra detalles de un canal del servidor.")
    .addChannelOption(o => o.setName("canal").setDescription("Canal que quieres consultar").setRequired(false)),
  async execute(i) {
    if (!i.guild) return i.reply({ content: "Este comando solo funciona en un servidor.", ephemeral: true });
    const channel = i.options.getChannel("canal") || i.channel;
    const fields = [
      { name: "ID", value: channel.id, inline: true },
      { name: "Tipo", value: CHANNEL_TYPES[channel.type] || "Tipo " + channel.type, inline: true },
      { name: "Creado", value: "<t:" + Math.floor(channel.createdTimestamp / 1000) + ":F>", inline: true }
    ];
    if (channel.parent) fields.push({ name: "Categoría", value: channel.parent.name, inline: true });
    if ("topic" in channel) fields.push({ name: "Tema", value: String(channel.topic || "Sin tema configurado").slice(0, 1024), inline: false });
    if (typeof channel.rateLimitPerUser === "number") fields.push({ name: "Modo lento", value: channel.rateLimitPerUser + " s", inline: true });
    if (typeof channel.userLimit === "number") fields.push({ name: "Límite de usuarios", value: channel.userLimit ? String(channel.userLimit) : "Sin límite", inline: true });
    if (typeof channel.bitrate === "number") fields.push({ name: "Calidad de audio", value: Math.round(channel.bitrate / 1000) + " kbps", inline: true });
    const embed = new EmbedBuilder().setColor(config.colors.primary || 0x8B5CF6)
      .setTitle("Información del canal • #" + channel.name).addFields(fields)
      .setFooter({ text: "FLUX STORE • Información del servidor" });
    return i.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
