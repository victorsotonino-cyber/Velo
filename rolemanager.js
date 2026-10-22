"use strict";
const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { canManageRole } = require("./utils/command-helpers");
module.exports = {
  data: new SlashCommandBuilder().setName("rolemanager")
    .setDescription("Añade o retira un rol a un miembro con comprobación de jerarquía.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(s => s.setName("add").setDescription("Añade un rol a un miembro.")
      .addUserOption(o => o.setName("usuario").setDescription("Miembro objetivo").setRequired(true))
      .addRoleOption(o => o.setName("rol").setDescription("Rol que se asignará").setRequired(true))
      .addStringOption(o => o.setName("motivo").setDescription("Motivo para auditoría").setRequired(false).setMaxLength(400)))
    .addSubcommand(s => s.setName("remove").setDescription("Retira un rol de un miembro.")
      .addUserOption(o => o.setName("usuario").setDescription("Miembro objetivo").setRequired(true))
      .addRoleOption(o => o.setName("rol").setDescription("Rol que se retirará").setRequired(true))
      .addStringOption(o => o.setName("motivo").setDescription("Motivo para auditoría").setRequired(false).setMaxLength(400))),
  async execute(i) {
    if (!i.guild || !i.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      return i.reply({ content: "Necesitas Gestionar roles para usar este comando.", ephemeral: true });
    }
    const action = i.options.getSubcommand();
    const user = i.options.getUser("usuario");
    const role = i.options.getRole("rol");
    const target = await i.guild.members.fetch(user.id).catch(() => null);
    const actor = await i.guild.members.fetch(i.user.id).catch(() => i.member);
    const botMember = i.guild.members.me;
    if (!target) return i.reply({ content: "Ese usuario no está en el servidor.", ephemeral: true });
    if (target.id === i.user.id) return i.reply({ content: "Por seguridad, no puedes modificar tus propios roles con este comando.", ephemeral: true });
    if (target.id === i.guild.ownerId) return i.reply({ content: "No puedes modificar los roles del propietario del servidor.", ephemeral: true });
    if (!canManageRole(actor, botMember, role, i.guild.ownerId)) {
      return i.reply({ content: "No puedes modificar ese rol: revisa que no sea gestionado por una integración y que esté por debajo de tu rol y del rol más alto del bot.", ephemeral: true });
    }
    if (!target.manageable) return i.reply({ content: "El bot no puede gestionar a ese miembro por la jerarquía de roles.", ephemeral: true });
    const reason = i.options.getString("motivo") || "Role manager ejecutado por " + i.user.tag;
    if (action === "add") {
      if (target.roles.cache.has(role.id)) return i.reply({ content: target.toString() + " ya tiene " + role.toString() + ".", ephemeral: true });
      await target.roles.add(role, reason);
      return i.reply({ content: "✅ Se asignó " + role.toString() + " a " + target.toString() + ".", allowedMentions: { parse: [] } });
    }
    if (!target.roles.cache.has(role.id)) return i.reply({ content: target.toString() + " no tiene " + role.toString() + ".", ephemeral: true });
    await target.roles.remove(role, reason);
    return i.reply({ content: "✅ Se retiró " + role.toString() + " de " + target.toString() + ".", allowedMentions: { parse: [] } });
  }
};
