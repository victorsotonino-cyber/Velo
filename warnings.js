"use strict";
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("./config");
const warningService = require("./utils/warnings-service");
module.exports = {
  data: new SlashCommandBuilder().setName("warnings").setDescription("Consulta o limpia las advertencias guardadas de un miembro.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand(s => s.setName("ver").setDescription("Consulta el historial de advertencias.")
      .addUserOption(o => o.setName("usuario").setDescription("Miembro que quieres revisar").setRequired(true)))
    .addSubcommand(s => s.setName("limpiar").setDescription("Elimina todas las advertencias guardadas para un miembro.")
      .addUserOption(o => o.setName("usuario").setDescription("Miembro cuyo historial se limpiará").setRequired(true))),
  async execute(i) {
    if (!i.guild || !i.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
      return i.reply({ content: "Necesitas Moderar miembros para consultar o limpiar advertencias.", ephemeral: true });
    }
    const action = i.options.getSubcommand();
    const user = i.options.getUser("usuario");
    if (action === "ver") {
      const entries = warningService.listWarnings(i.guild.id, user.id);
      if (!entries.length) return i.reply({ content: user.tag + " no tiene advertencias guardadas en este servidor.", ephemeral: true });
      const lines = entries.slice(0, 10).map(entry =>
        "**" + entry.id + "** · <t:" + Math.floor(new Date(entry.createdAt).getTime() / 1000) + ":d>\n" +
        "Motivo: " + entry.reason.slice(0, 250) + "\nModerador: " + entry.moderatorTag
      );
      const embed = new EmbedBuilder().setColor(config.colors.warning || 0xF59E0B)
        .setTitle("⚠️ Advertencias • " + user.tag)
        .setDescription(lines.join("\n\n").slice(0, 4000))
        .setFooter({ text: "Total guardado: " + entries.length + " • Se muestran como máximo las 10 más recientes." });
      return i.reply({ embeds: [embed], ephemeral: true, allowedMentions: { parse: [] } });
    }
    const existing = warningService.listWarnings(i.guild.id, user.id);
    if (!existing.length) return i.reply({ content: "No hay advertencias guardadas para " + user.tag + ".", ephemeral: true });
    await i.deferReply({ ephemeral: true });
    const removed = warningService.clearWarnings(i.guild.id, user.id);
    const log = config.channels.logs ? i.guild.channels.cache.get(config.channels.logs) : null;
    if (log?.isTextBased()) {
      await log.send({ content: "🧾 " + i.user.tag + " eliminó " + removed + " advertencia(s) guardada(s) de " + user.tag + " en " + i.guild.name + ".", allowedMentions: { parse: [] } }).catch(() => {});
    }
    return i.editReply({ content: "✅ Se eliminaron " + removed + " advertencia(s) de " + user.tag + "." });
  }
};
