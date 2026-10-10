const { SlashCommandBuilder } = require("discord.js");
const { emoji } = require("./ui");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("afk")
    .setDescription("Activa o quita tu estado AFK.")
    .addStringOption(option => option.setName("mensaje").setDescription("Motivo de ausencia").setMaxLength(180).setRequired(false)),
  async execute(interaction, client) {
    const message = interaction.options.getString("mensaje");
    if (!client.afkUsers) client.afkUsers = new Map();
    if (message === null && client.afkUsers.has(interaction.user.id)) {
      client.afkUsers.delete(interaction.user.id);
      return interaction.reply({ content: emoji(interaction.guild, "success", "✅") + " Estado AFK eliminado." });
    }
    const reason = message || "AFK";
    client.afkUsers.set(interaction.user.id, { message: reason, since: Date.now() });
    return interaction.reply({ content: emoji(interaction.guild, "info", "💤") + " Ahora estás AFK: " + reason });
  }
};
