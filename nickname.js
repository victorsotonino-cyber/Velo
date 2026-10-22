"use strict";
const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { canModerateTarget } = require("./utils/permissions");
module.exports = {
  data: new SlashCommandBuilder().setName("nickname").setDescription("Cambia o quita el apodo de un miembro.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .addUserOption(o => o.setName("usuario").setDescription("Miembro al que cambiar el apodo").setRequired(true))
    .addStringOption(o => o.setName("apodo").setDescription("Nuevo apodo; escribe Quitar para eliminarlo").setRequired(true).setMaxLength(32))
    .addStringOption(o => o.setName("motivo").setDescription("Motivo para el registro de auditoría").setRequired(false).setMaxLength(400)),
  async execute(i) {
    if (!i.guild || !i.memberPermissions?.has(PermissionFlagsBits.ManageNicknames)) {
      return i.reply({ content: "Necesitas Gestionar apodos para usar este comando.", ephemeral: true });
    }
    const targetUser = i.options.getUser("usuario");
    const nicknameInput = i.options.getString("apodo").trim();
    const reason = i.options.getString("motivo") || "Apodo actualizado por " + i.user.tag;
    const target = await i.guild.members.fetch(targetUser.id).catch(() => null);
    if (!target) return i.reply({ content: "Ese usuario no está en el servidor.", ephemeral: true });
    const actor = await i.guild.members.fetch(i.user.id).catch(() => i.member);
    if (!canModerateTarget(actor, target, i.guild.ownerId)) {
      return i.reply({ content: "No puedes cambiar el apodo de ti mismo, del propietario ni de alguien con un rol igual o superior al tuyo.", ephemeral: true });
    }
    if (!target.manageable) return i.reply({ content: "El bot no puede administrar a ese miembro por la jerarquía de roles.", ephemeral: true });
    const nickname = ["quitar", "reset", "borrar"].includes(nicknameInput.toLowerCase()) ? null : nicknameInput;
    await i.deferReply({ ephemeral: true });
    await target.setNickname(nickname, reason);
    return i.editReply({
      content: nickname ? "✅ Apodo de " + target.toString() + " cambiado a " + nickname + "." : "✅ Apodo de " + target.toString() + " eliminado.",
      allowedMentions: { parse: [] }
    });
  }
};
