const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { emoji } = require("./ui");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Quita el timeout a un miembro.")
    .addUserOption(o=>o.setName("usuario").setDescription("Usuario").setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(i) {
    const user=i.options.getUser("usuario");
    const member=await i.guild.members.fetch(user.id).catch(()=>null);
    if(!member) return i.reply({content:emoji(i.guild,"error","❌")+" Usuario no encontrado.",ephemeral:true});
    if(!member.communicationDisabledUntilTimestamp) return i.reply({content:emoji(i.guild,"info","ℹ️")+" Ese usuario no tiene timeout.",ephemeral:true});
    if(member.roles.highest.position>=i.member.roles.highest.position && i.guild.ownerId!==i.user.id) return i.reply({content:emoji(i.guild,"error","❌")+" No puedes moderar a ese usuario.",ephemeral:true});
    await member.timeout(null,"Timeout retirado por "+i.user.tag);
    return i.reply(emoji(i.guild,"success","✅")+" Timeout retirado a "+user+".");
  }
};
