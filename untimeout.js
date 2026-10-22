const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { emoji } = require("./ui");
const { canModerateTarget } = require("./utils/permissions");

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
    const actor = await i.guild.members.fetch(i.user.id).catch(() => i.member);
    if (!canModerateTarget(actor, member, i.guild.ownerId)) return i.reply({content:emoji(i.guild,"error","❌")+" No puedes quitar el timeout al propietario, a ti mismo ni a alguien con un rol igual o superior al tuyo.",ephemeral:true});
    await member.timeout(null,"Timeout retirado por "+i.user.tag);
    return i.reply(emoji(i.guild,"success","✅")+" Timeout retirado a "+user+".");
  }
};
