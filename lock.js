const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { emoji } = require("./ui");

module.exports = {
  data:new SlashCommandBuilder().setName("lock").setDescription("Bloquea el canal para @everyone.").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(i){
    if (!i.guild || !i.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) return i.reply({ content: emoji(i.guild,"error","❌")+" Necesitas **Gestionar canales** para bloquear un canal.",ephemeral:true });
    if (!i.channel?.permissionOverwrites) return i.reply({ content: "Este comando solo funciona en un canal de servidor.", ephemeral: true });
    await i.channel.permissionOverwrites.edit(i.guild.roles.everyone,{SendMessages:false});
    return i.reply(emoji(i.guild,"lock","🔒")+" Canal bloqueado.");
  }
};
