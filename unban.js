const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { emoji } = require("./ui");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Quita el baneo usando el ID del usuario.")
    .addStringOption(o => o.setName("usuario").setDescription("ID del usuario baneado").setRequired(true))
    .addStringOption(o => o.setName("motivo").setDescription("Motivo").setRequired(false).setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  async execute(i) {
    const id=i.options.getString("usuario").trim();
    if (!/^\d{17,20}$/.test(id)) return i.reply({content:emoji(i.guild,"error","❌")+" ID de usuario no válida.",ephemeral:true});
    const bans=await i.guild.bans.fetch().catch(()=>null);
    if (!bans || !bans.has(id)) return i.reply({content:emoji(i.guild,"error","❌")+" Ese usuario no está baneado.",ephemeral:true});
    await i.guild.members.unban(id,i.options.getString("motivo")||"Sin motivo").catch(e=>{throw e});
    return i.reply(emoji(i.guild,"success","✅")+" Baneo retirado correctamente.");
  }
};
