const {
  SlashCommandBuilder,
  PermissionFlagsBits
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Silencia temporalmente a un usuario.")
    .addUserOption(o =>
      o.setName("usuario").setDescription("Usuario").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("minutos").setDescription("Duración").setRequired(true).setMinValue(1).setMaxValue(40320)
    )
    .addStringOption(o =>
      o.setName("motivo").setDescription("Motivo").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const user = interaction.options.getUser("usuario");
    const minutes = interaction.options.getInteger("minutos");
    const reason = interaction.options.getString("motivo") || "Sin motivo";
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member || !member.moderatable) {
      return interaction.reply({ content: "❌ No puedo aplicar timeout a ese usuario.", ephemeral: true });
    }

    await member.timeout(minutes * 60 * 1000, reason);
    await interaction.reply(`🔇 **${user.tag}** tiene timeout durante **${minutes} minutos**.`);
  }
};
