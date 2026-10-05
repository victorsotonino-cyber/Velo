const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
module.exports = {
  data: new SlashCommandBuilder().setName("clear").setDescription("Borra mensajes.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption(o => o.setName("cantidad").setDescription("1-100").setMinValue(1).setMaxValue(100).setRequired(true)),
  async execute(i) {
    const n = i.options.getInteger("cantidad");
    const deleted = await i.channel.bulkDelete(n, true);
    await i.reply({ content: "🧹 " + deleted.size + " mensajes eliminados.", ephemeral: true });
  }
};