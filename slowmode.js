const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { emoji } = require("./ui");

module.exports = {
  data:new SlashCommandBuilder().setName("slowmode").setDescription("Configura el modo lento del canal.")
    .addIntegerOption(o=>o.setName("segundos").setDescription("0 a 21600 segundos").setRequired(true).setMinValue(0).setMaxValue(21600))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(i){
    if (!i.guild || !i.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) return i.reply({ content: emoji(i.guild,"error","❌")+" Necesitas **Gestionar canales** para cambiar el modo lento.",ephemeral:true });
    if (!i.channel?.setRateLimitPerUser) return i.reply({ content: "Este comando solo funciona en un canal compatible de servidor.", ephemeral: true });
    const seconds=i.options.getInteger("segundos");
    await i.channel.setRateLimitPerUser(seconds,"Configurado por "+i.user.tag);
    return i.reply(emoji(i.guild,"slow","🐌")+" Slowmode establecido en **"+seconds+"s**.");
  }
};
