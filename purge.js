"use strict";
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("./config");
module.exports = {
  data: new SlashCommandBuilder().setName("purge")
    .setDescription("Elimina mensajes recientes, opcionalmente solo de un miembro.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName("cantidad").setDescription("Cantidad de mensajes a revisar (1-100)").setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption(o => o.setName("usuario").setDescription("Limitar la limpieza a este usuario").setRequired(false)),
  async execute(i) {
    if (!i.guild || !i.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      return i.reply({ content: "Necesitas el permiso Gestionar mensajes para usar /purge.", ephemeral: true });
    }
    if (typeof i.channel.bulkDelete !== "function" || typeof i.channel.messages?.fetch !== "function") {
      return i.reply({ content: "Este tipo de canal no admite limpieza masiva.", ephemeral: true });
    }
    const count = i.options.getInteger("cantidad");
    const target = i.options.getUser("usuario");
    await i.deferReply({ ephemeral: true });
    const fetched = await i.channel.messages.fetch({ limit: count });
    const selected = target ? fetched.filter(message => message.author.id === target.id) : fetched;
    if (!selected.size) return i.editReply({ content: target ? "No encontré mensajes recientes de ese usuario en la cantidad revisada." : "No encontré mensajes que se puedan eliminar." });
    const deleted = await i.channel.bulkDelete(selected, true);
    const embed = new EmbedBuilder().setColor(config.colors.success || 0x22C55E)
      .setTitle("🧹 Limpieza completada")
      .setDescription("Se eliminaron " + deleted.size + " mensaje(s)." + (target ? "\nFiltro: " + target.tag : ""))
      .setFooter({ text: "Los mensajes de más de 14 días se omiten automáticamente." }).setTimestamp();
    return i.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
