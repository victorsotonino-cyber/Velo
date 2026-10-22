const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { emoji } = require("./ui");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("say")
    .setDescription("Hace que FLUX STORE envíe un mensaje.")
    .addStringOption(o => o.setName("mensaje").setDescription("Mensaje que quieres enviar").setRequired(true).setMaxLength(2000))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(i) {
    if (!i.guild || !i.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
      return i.reply({ content: emoji(i.guild, "error", "❌") + " Necesitas **Gestionar mensajes** para usar este comando.", ephemeral: true });
    }
    const text = i.options.getString("mensaje");
    await i.channel.send({ content: text, allowedMentions: { parse: [] } });
    return i.reply({ content: emoji(i.guild, "success", "✅") + " Mensaje enviado; las menciones no se notificarán.", ephemeral: true });
  }
};
