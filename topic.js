"use strict";
const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
module.exports = {
  data: new SlashCommandBuilder().setName("topic").setDescription("Cambia o elimina el tema de un canal de texto.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addStringOption(o => o.setName("texto").setDescription("Nuevo tema; escribe BORRAR para eliminar el tema actual").setRequired(true).setMaxLength(1024)),
  async execute(i) {
    if (!i.guild || !i.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
      return i.reply({ content: "Necesitas Gestionar canales para cambiar el tema.", ephemeral: true });
    }
    if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(i.channel.type)) {
      return i.reply({ content: "Este comando solo funciona en canales de texto o anuncios.", ephemeral: true });
    }
    const input = i.options.getString("texto").trim();
    const topic = ["borrar", "quitar", "delete"].includes(input.toLowerCase()) ? null : input;
    await i.deferReply({ ephemeral: true });
    await i.channel.setTopic(topic, "Tema actualizado por " + i.user.tag);
    return i.editReply({ content: topic ? "✅ Tema del canal actualizado." : "✅ Tema del canal eliminado." });
  }
};
