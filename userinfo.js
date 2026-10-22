"use strict";

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Muestra información pública de un miembro del servidor.")
    .addUserOption(function (o) {
      return o.setName("usuario").setDescription("Miembro que quieres consultar").setRequired(false);
    }),
  async execute(i) {
    if (!i.guild) return i.reply({ content: "Este comando solo funciona dentro de un servidor.", ephemeral: true });
    const user = i.options.getUser("usuario") || i.user;
    const member = await i.guild.members.fetch(user.id).catch(function () { return null; });
    const roles = member
      ? member.roles.cache.filter(function (role) { return role.id !== i.guild.id; })
        .sort(function (a, b) { return b.position - a.position; })
        .map(function (role) { return role.toString(); }).slice(0, 12).join(" ")
      : "No es miembro de este servidor.";

    const fields = [
      { name: "ID de usuario", value: user.id, inline: true },
      { name: "Cuenta bot", value: user.bot ? "Sí" : "No", inline: true },
      { name: "Creación de cuenta", value: "<t:" + Math.floor(user.createdTimestamp / 1000) + ":F>", inline: false },
      { name: "Entrada al servidor", value: member && member.joinedTimestamp
        ? "<t:" + Math.floor(member.joinedTimestamp / 1000) + ":F>" : "No disponible", inline: false },
      { name: "Roles", value: (roles || "Sin roles adicionales").slice(0, 1024), inline: false }
    ];

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle("👤 Información de usuario • " + String(user.tag || user.username).slice(0, 200))
      .setThumbnail(user.displayAvatarURL({ size: 512 }))
      .addFields(fields)
      .setFooter({ text: "FLUX STORE • Información pública del servidor" })
      .setTimestamp();
    return i.reply({ embeds: [embed], ephemeral: true });
  }
};
