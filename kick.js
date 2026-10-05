const {
  SlashCommandBuilder,
  PermissionFlagsBits
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Expulsa a un usuario.")
    .addUserOption(o =>
      o.setName("usuario").setDescription("Usuario").setRequired(true)
    )
    .addStringOption(o =>
      o.setName("motivo").setDescription("Motivo").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

  async execute(interaction) {
    const user = interaction.options.getUser("usuario");
    const reason = interaction.options.getString("motivo") || "Sin motivo";
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);

    if (!member || !member.kickable) {
      return interaction.reply({ content: "❌ No puedo expulsar a ese usuario.", ephemeral: true });
    }

    await member.kick(reason);
    await interaction.reply(`👢 **${user.tag}** fue expulsado.\nMotivo: ${reason}`);
  }
};
