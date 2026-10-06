const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const config = require("./config");
const { emoji } = require("./ui");

module.exports = {
  data: new SlashCommandBuilder().setName("ban").setDescription("Banea a un usuario.")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption(o => o.setName("usuario").setDescription("Usuario").setRequired(true))
    .addStringOption(o => o.setName("motivo").setDescription("Motivo").setRequired(false).setMaxLength(512)),
  async execute(i) {
    const u = i.options.getUser("usuario");
    const target = await i.guild.members.fetch(u.id).catch(() => null);
    const reason = i.options.getString("motivo") || "Sin motivo";
    if (target && !target.bannable) {
      return i.reply({ content: emoji(i.guild, "error", "❌") + " No puedo banear a ese usuario. Revisa la jerarquía de roles/permisos.", ephemeral: true });
    }
    await i.guild.members.ban(u, { reason });
    const embed = new EmbedBuilder()
      .setColor(config.colors.error)
      .setTitle(emoji(i.guild, "moderation", "🛡️") + " Usuario baneado")
      .setDescription("**" + u.tag + "** fue baneado correctamente.")
      .addFields({ name: emoji(i.guild, "info", "📌") + " Motivo", value: reason });
    await i.reply({ embeds: [embed] });
  }
};
