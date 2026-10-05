const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
module.exports = {
  data: new SlashCommandBuilder().setName("kick").setDescription("Expulsa a un usuario.")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o => o.setName("usuario").setDescription("Usuario").setRequired(true))
    .addStringOption(o => o.setName("motivo").setDescription("Motivo").setRequired(false).setMaxLength(512)),
  async execute(i) {
    const target = await i.guild.members.fetch(i.options.getUser("usuario").id).catch(() => null);
    const reason = i.options.getString("motivo") || "Sin motivo";
    if (!target) return i.reply({ content: "❌ Ese usuario no está en el servidor.", ephemeral: true });
    if (!target.kickable) return i.reply({ content: "❌ No puedo expulsar a ese usuario. Revisa la jerarquía de roles/permisos.", ephemeral: true });
    await target.kick(reason);
    await i.reply("👢 " + target.user.tag + " expulsado. Motivo: " + reason);
  }
};