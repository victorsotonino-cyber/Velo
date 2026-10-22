"use strict";
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("./config");
const CHECKS = [
  [PermissionFlagsBits.ViewChannel, "Ver canal"],
  [PermissionFlagsBits.SendMessages, "Enviar mensajes"],
  [PermissionFlagsBits.EmbedLinks, "Insertar enlaces"],
  [PermissionFlagsBits.ReadMessageHistory, "Leer historial"],
  [PermissionFlagsBits.AddReactions, "Añadir reacciones"],
  [PermissionFlagsBits.ManageChannels, "Gestionar canales"],
  [PermissionFlagsBits.ManageMessages, "Gestionar mensajes"],
  [PermissionFlagsBits.ManageRoles, "Gestionar roles"],
  [PermissionFlagsBits.ModerateMembers, "Moderar miembros"],
  [PermissionFlagsBits.KickMembers, "Expulsar miembros"],
  [PermissionFlagsBits.BanMembers, "Banear miembros"]
];
module.exports = {
  data: new SlashCommandBuilder().setName("permcheck").setDescription("Diagnostica los permisos efectivos del bot en un canal.")
    .addChannelOption(o => o.setName("canal").setDescription("Canal que se comprobará; por defecto el actual").setRequired(false)),
  async execute(i) {
    if (!i.guild) return i.reply({ content: "Este comando solo funciona en un servidor.", ephemeral: true });
    const channel = i.options.getChannel("canal") || i.channel;
    const effective = channel.permissionsFor(i.guild.members.me);
    const missing = CHECKS.filter(([permission]) => !effective?.has(permission)).map(([, label]) => "❌ " + label);
    const present = CHECKS.filter(([permission]) => effective?.has(permission)).map(([, label]) => "✅ " + label);
    const embed = new EmbedBuilder().setColor(missing.length ? config.colors.warning : config.colors.success)
      .setTitle("🔎 Diagnóstico de permisos").setDescription("Canal: " + channel.toString() + "\nBot: " + i.client.user.tag)
      .addFields(
        { name: "Disponibles", value: present.join("\n").slice(0, 1024) || "Ninguno de los permisos comprobados.", inline: true },
        { name: "Faltan", value: missing.join("\n").slice(0, 1024) || "✅ Ninguno de los permisos comprobados.", inline: true }
      ).setFooter({ text: "Los permisos se calculan para este canal, incluidos sus overrides." }).setTimestamp();
    return i.reply({ embeds: [embed], ephemeral: true, allowedMentions: { parse: [] } });
  }
};
