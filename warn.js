const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const config = require("./config");
const { emoji } = require("./ui");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Advierte a un miembro.")
    .addUserOption(o => o.setName("usuario").setDescription("Usuario a advertir").setRequired(true))
    .addStringOption(o => o.setName("motivo").setDescription("Motivo de la advertencia").setRequired(false).setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(i) {
    const user = i.options.getUser("usuario");
    const reason = i.options.getString("motivo") || "Sin motivo indicado";
    const member = await i.guild.members.fetch(user.id).catch(() => null);
    if (!member) return i.reply({ content: emoji(i.guild,"error","❌")+" Usuario no encontrado.", ephemeral:true });
    if (member.id === i.user.id) return i.reply({ content: emoji(i.guild,"error","❌")+" No puedes advertirte a ti mismo.", ephemeral:true });
    if (member.roles.highest.position >= i.member.roles.highest.position && i.guild.ownerId !== i.user.id) {
      return i.reply({ content: emoji(i.guild,"error","❌")+" No puedes moderar a alguien con un rol igual o superior al tuyo.", ephemeral:true });
    }
    const embed = new EmbedBuilder().setColor(config.colors.warning).setTitle(emoji(i.guild,"warning","⚠️")+" Advertencia").setDescription("Has recibido una advertencia en **"+i.guild.name+"**.").addFields({name:"Motivo",value:reason},{name:"Moderador",value:i.user.tag});
    await user.send({embeds:[embed]}).catch(()=>{});
    const log = i.guild.channels.cache.get(config.channels.logs);
    if (log) await log.send({embeds:[embed.addFields({name:"Usuario",value:user.tag+" ("+user.id+")"})]}).catch(()=>{});
    return i.reply({ content: emoji(i.guild,"warning","⚠️")+" "+user+" ha recibido una advertencia.", ephemeral:false });
  }
};
