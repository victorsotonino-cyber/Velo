const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { emoji } = require("./ui");

module.exports = {
  data:new SlashCommandBuilder().setName("lock").setDescription("Bloquea el canal para @everyone.").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(i){
    await i.channel.permissionOverwrites.edit(i.guild.roles.everyone,{SendMessages:false});
    return i.reply(emoji(i.guild,"lock","🔒")+" Canal bloqueado.");
  }
};
