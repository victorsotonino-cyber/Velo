const {
  SlashCommandBuilder,
  PermissionFlagsBits
} = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Banea a un usuario.")
    .addUserOption(o =>
      o.setName("usuario")
       .setDescription("Usuario a banear")
       .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("motivo")
       .setDescription("Motivo")
       .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const user = interaction.options.getUser("usuario");
    const reason = interaction.options.getString("motivo") || "Sin motivo";

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      return interaction.reply({ content: "❌ No encuentro a ese miembro.", ephemeral: true });
    }

    if (!member.bannable) {
      return interaction.reply({ content: "❌ No puedo banear a ese usuario.", ephemeral: true });
    }

    await member.ban({ reason });

    await interaction.reply(`🔨 **${user.tag}** ha sido baneado.\nMotivo: ${reason}`);
  }
};
