"use strict";
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
module.exports = {
  data: new SlashCommandBuilder().setName("roleinfo").setDescription("Muestra detalles de un rol del servidor.")
    .addRoleOption(o => o.setName("rol").setDescription("Rol que quieres consultar").setRequired(true)),
  async execute(i) {
    if (!i.guild) return i.reply({ content: "Este comando solo funciona en un servidor.", ephemeral: true });
    const role = i.options.getRole("rol");
    const permissions = role.permissions.toArray();
    const shown = permissions.slice(0, 12).join(", ");
    const embed = new EmbedBuilder().setColor(role.color || config.colors.primary || 0x8B5CF6)
      .setTitle("Información del rol • " + role.name)
      .addFields(
        { name: "ID", value: role.id, inline: true },
        { name: "Miembros en caché", value: String(role.members.size), inline: true },
        { name: "Posición", value: String(role.position), inline: true },
        { name: "Color", value: role.hexColor, inline: true },
        { name: "Mencionable", value: role.mentionable ? "Sí" : "No", inline: true },
        { name: "Gestionado por integración", value: role.managed ? "Sí" : "No", inline: true },
        { name: "Creado", value: "<t:" + Math.floor(role.createdTimestamp / 1000) + ":F>", inline: false },
        { name: "Permisos principales", value: shown ? shown.slice(0, 1024) : "Sin permisos especiales.", inline: false }
      ).setFooter({ text: "Los miembros mostrados dependen de la caché disponible." });
    return i.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
