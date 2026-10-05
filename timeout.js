const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
module.exports = {
  data: new SlashCommandBuilder().setName("timeout").setDescription("Aplica timeout.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption(o => o.setName("usuario").setDescription("Usuario").setRequired(true))
    .addIntegerOption(o => o.setName("minutos").setDescription("Minutos").setMinValue(1).setMaxValue(40320).setRequired(true))
    .addStringOption(o => o.setName("motivo").setDescription("Motivo").setRequired(false).setMaxLength(512)),
  async execute(i) {
    const target = await i.guild.members.fetch(i.options.getUser("usuario").id).catch(() => null);
    const min = i.options.getInteger("minutos");
    const reason = i.options.getString("motivo") || "Sin motivo";
    if (!target) return i.reply({ content: "❌ Ese usuario no está en el servidor.", ephemeral: true });
    if (!target.moderatable) return i.reply({ content: "❌ No puedo aplicar timeout a ese usuario. Revisa la jerarquía de roles/permisos.", ephemeral: true });
    await target.timeout(min * 60000, reason);
    await i.reply("⏳ " + target.user.tag + " en timeout durante **" + min + " min**.");
  }
};