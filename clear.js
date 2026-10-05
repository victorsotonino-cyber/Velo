const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("clear")
    .setDescription("Elimina mensajes.")
    .addIntegerOption(o =>
      o.setName("cantidad")
       .setDescription("Cantidad de mensajes, 1-100")
       .setRequired(true)
       .setMinValue(1)
       .setMaxValue(100)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const amount = interaction.options.getInteger("cantidad");

    await interaction.channel.bulkDelete(amount, true);

    await interaction.reply({
      content: `🧹 Eliminados **${amount}** mensajes.`,
      ephemeral: true
    });
  }
};
