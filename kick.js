const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const config = require("./config");
const { emoji } = require("./ui");

module.exports = {
  data: new SlashCommandBuilder().setName("kick").setDescription("Expulsa a un usuario.")
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption(o => o.setName("usuario").setDescription("Usuario").setRequired(true))
    .addStringOption(o => o.setName("motivo").setDescription("Motivo").setRequired(false).setMaxLength(512)),
  async execute(i) {
    const target = await i.guild.members.fetch(i.options.getUser("usuario").id).catch(() => null);
    const reason = i.options.getString("motivo") || "Sin motivo";
    if (!target) return i.reply({ content: emoji(i.guild, "error", "❌") + " Ese usuario no está en el servidor.", ephemeral: true });
    if (!target.kickable) return i.reply({ content: emoji(i.guild, "error", "❌") + " No puedo expulsar a ese usuario. Revisa la jerarquía de roles/permisos.", ephemeral: true });
    await target.kick(reason);
    const embed = new EmbedBuilder()
      .setColor(config.colors.warning)
      .setTitle(emoji(i.guild, "moderation", "🛡️") + " Usuario expulsado")
      .setDescription("**" + target.user.tag + "** fue expulsado correctamente.")
      .addFields({ name: emoji(i.guild, "info", "📌") + " Motivo", value: reason });
    await i.reply({ embeds: [embed] });
  }
};
