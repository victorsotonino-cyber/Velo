"use strict";
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const config = require("./config");
const { parseHexColor } = require("./utils/command-helpers");
module.exports = {
  data: new SlashCommandBuilder().setName("embed").setDescription("Publica un embed personalizado de FLUX STORE.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName("titulo").setDescription("Título del embed").setRequired(true).setMaxLength(250))
    .addStringOption(o => o.setName("descripcion").setDescription("Contenido del embed").setRequired(true).setMaxLength(3500))
    .addStringOption(o => o.setName("color").setDescription("Color hexadecimal, por ejemplo #8B5CF6").setRequired(false).setMaxLength(7))
    .addStringOption(o => o.setName("pie").setDescription("Texto del pie (opcional)").setRequired(false).setMaxLength(200))
    .addChannelOption(o => o.setName("canal").setDescription("Canal donde publicar; por defecto el actual").setRequired(false)),
  async execute(i) {
    if (!i.guild || !i.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      return i.reply({ content: "Necesitas Gestionar mensajes para publicar un embed personalizado.", ephemeral: true });
    }
    const title = i.options.getString("titulo").trim();
    const description = i.options.getString("descripcion").trim();
    const colorInput = i.options.getString("color") || "#8B5CF6";
    const footer = i.options.getString("pie");
    const channel = i.options.getChannel("canal") || i.channel;
    const color = parseHexColor(colorInput);
    if (!title || !description || color === null) {
      return i.reply({ content: "El título y la descripción son obligatorios; el color debe ser hexadecimal de seis dígitos, como #8B5CF6.", ephemeral: true });
    }
    if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
      return i.reply({ content: "El canal elegido debe ser un canal de texto o de anuncios.", ephemeral: true });
    }
    const permissions = channel.permissionsFor(i.guild.members.me);
    if (!permissions?.has(PermissionFlagsBits.ViewChannel) ||
        !permissions?.has(PermissionFlagsBits.SendMessages) ||
        !permissions?.has(PermissionFlagsBits.EmbedLinks)) {
      return i.reply({ content: "Al bot le falta Ver canal, Enviar mensajes o Insertar enlaces en el canal seleccionado.", ephemeral: true });
    }
    const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(description);
    if (footer) embed.setFooter({ text: footer });
    embed.setAuthor({ name: "FLUX STORE" }).setTimestamp();
    await i.deferReply({ ephemeral: true });
    await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    return i.editReply({ content: "✅ Embed publicado en " + channel.toString() + ".", allowedMentions: { parse: [] } });
  }
};
