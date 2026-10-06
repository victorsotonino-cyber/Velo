const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { emoji } = require("./ui");

module.exports = {
  data:new SlashCommandBuilder().setName("unlock").setDescription("Desbloquea el canal para @everyone.").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(i){
    await i.channel.permissionOverwrites.edit(i.guild.roles.everyone,{SendMessages:null});
    return i.reply(emoji(i.guild,"success","✅")+" Canal desbloqueado.");
  }
};
