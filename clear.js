const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const config = require("./config");
const { emoji } = require("./ui");

module.exports = {
  data: new SlashCommandBuilder().setName("clear").setDescription("Borra mensajes.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName("cantidad").setDescription("1-100").setMinValue(1).setMaxValue(100).setRequired(true)),
  async execute(i) {
    if (!i.guild || !i.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      return i.reply({ content: emoji(i.guild, "error", "❌") + " Necesitas **Gestionar mensajes** para usar la limpieza.", ephemeral: true });
    }
    const n = i.options.getInteger("cantidad");
    const deleted = await i.channel.bulkDelete(n, true);
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(emoji(i.guild, "trash", "🧹") + " Limpieza completada")
      .setDescription("Se eliminaron **" + deleted.size + "** mensajes.")
      .setFooter({ text: "FLUX STORE • Moderación" });
    await i.reply({ embeds: [embed], ephemeral: true });
  }
};
