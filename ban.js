const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
module.exports = {
  data: new SlashCommandBuilder().setName("ban").setDescription("Banea a un usuario.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName("usuario").setDescription("Usuario").setRequired(true))
    .addStringOption(o => o.setName("motivo").setDescription("Motivo").setRequired(false).setMaxLength(512)),
  async execute(i) {
    const u = i.options.getUser("usuario");
    const target = await i.guild.members.fetch(u.id).catch(() => null);
    const reason = i.options.getString("motivo") || "Sin motivo";
    if (target && !target.bannable) return i.reply({ content: "❌ No puedo banear a ese usuario. Revisa la jerarquía de roles/permisos.", ephemeral: true });
    await i.guild.members.ban(u, { reason });
    await i.reply("🔨 " + u.tag + " baneado. Motivo: " + reason);
  }
};