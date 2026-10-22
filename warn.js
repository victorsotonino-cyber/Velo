"use strict";
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const config = require("./config");
const { emoji } = require("./ui");
const { canModerateTarget } = require("./utils/permissions");
const warningService = require("./utils/warnings-service");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Advierte a un miembro y guarda el registro.")
    .addUserOption(o => o.setName("usuario").setDescription("Usuario a advertir").setRequired(true))
    .addStringOption(o => o.setName("motivo").setDescription("Motivo de la advertencia").setRequired(false).setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(i) {
    if (!i.guild || !i.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
      return i.reply({ content: emoji(i.guild, "error", "❌") + " Necesitas Moderar miembros para usar este comando.", ephemeral: true });
    }

    await i.deferReply({ ephemeral: true });
    const user = i.options.getUser("usuario");
    const reason = i.options.getString("motivo") || "Sin motivo indicado";
    const member = await i.guild.members.fetch(user.id).catch(() => null);
    if (!member) return i.editReply({ content: emoji(i.guild, "error", "❌") + " Ese usuario no está en el servidor." });

    const actor = await i.guild.members.fetch(i.user.id).catch(() => i.member);
    if (!canModerateTarget(actor, member, i.guild.ownerId)) {
      return i.editReply({ content: emoji(i.guild, "error", "❌") + " No puedes advertir al propietario, a ti mismo ni a alguien con un rol igual o superior al tuyo." });
    }

    const warning = warningService.addWarning({
      guildId: i.guild.id,
      userId: user.id,
      moderatorId: i.user.id,
      moderatorTag: i.user.tag,
      reason
    });

    const dmEmbed = new EmbedBuilder()
      .setColor(config.colors.warning || 0xF59E0B)
      .setTitle(emoji(i.guild, "warning", "⚠️") + " Advertencia")
      .setDescription("Has recibido una advertencia en **" + i.guild.name + "**.")
      .addFields(
        { name: "ID de advertencia", value: warning.id, inline: true },
        { name: "Motivo", value: reason.slice(0, 1000), inline: false },
        { name: "Moderador", value: i.user.tag, inline: true }
      )
      .setTimestamp();

    const dmSent = await user.send({ embeds: [dmEmbed] }).then(() => true).catch(() => false);
    const log = config.channels.logs ? i.guild.channels.cache.get(config.channels.logs) : null;
    if (log?.isTextBased() && typeof log.send === "function") {
      const logEmbed = EmbedBuilder.from(dmEmbed)
        .addFields({ name: "Usuario", value: user.tag + " (" + user.id + ")", inline: false })
        .setFooter({ text: "FLUX STORE • Historial de advertencias • " + warning.id });
      await log.send({ embeds: [logEmbed], allowedMentions: { parse: [] } }).catch(error => {
        console.error("No se pudo registrar la advertencia en el canal de logs:", error.message);
      });
    }

    return i.editReply({
      content: emoji(i.guild, "warning", "⚠️") + " Advertencia " + warning.id + " guardada para " + user.tag + "." +
        (dmSent ? " Se le envió un aviso por mensaje privado." : " No pude enviarle un DM; el registro quedó guardado."),
      allowedMentions: { parse: [] }
    });
  }
};
