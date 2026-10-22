const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const config = require("./config");
const { emoji } = require("./ui");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket-config")
    .setDescription("Muestra la configuración de tickets.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(i) {
    if (!i.guild || !i.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
      return i.reply({ content: emoji(i.guild, "error", "❌") + " Necesitas **Gestionar canales** para consultar esta configuración.", ephemeral: true });
    }
    const c = i.guild.channels.cache.get(config.channels.tickets);
    const r = i.guild.roles.cache.get(config.roles.staff);
    const e = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(emoji(i.guild, "settings", "⚙️") + " Configuración de tickets")
      .addFields(
        { name: emoji(i.guild, "channel", "📂") + " Categoría base", value: c ? String(c) : "No encontrada", inline: true },
        { name: emoji(i.guild, "users", "👥") + " Staff", value: r ? String(r) : "No encontrado", inline: true }
      );
    await i.reply({ embeds: [e], ephemeral: true });
  }
};
