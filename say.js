const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { emoji } = require("./ui");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("say")
    .setDescription("Hace que Velo Studio envíe un mensaje.")
    .addStringOption(o => o.setName("mensaje").setDescription("Mensaje que quieres enviar").setRequired(true).setMaxLength(2000))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(i) {
    const text = i.options.getString("mensaje");
    await i.channel.send(text);
    return i.reply({ content: emoji(i.guild, "success", "✅") + " Mensaje enviado.", ephemeral: true });
  }
};
