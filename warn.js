const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const config = require("./config");
const { emoji } = require("./ui");
const { canModerateTarget } = require("./utils/permissions");
const warningService = require("./utils/warnings-service");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Advierte a un miembro.")
    .addUserOption(o => o.setName("usuario").setDescription("Usuario a advertir").setRequired(true))
    .addStringOption(o => o.setName("motivo").setDescription("Motivo de la advertencia").setRequired(false).setMaxLength(500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  async execute(i) {
    if (!i.guild || !i.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
      return i.reply({ content: emoji(i.guild,"error","❌")+" Necesitas **Moderar miembros** para usar este comando.",ephemeral:true });
    }
    const user = i.options.getUser("usuario");
    const reason = i.options.getString("motivo") || "Sin motivo indicado";
    const member = await i.guild.members.fetch(user.id).catch(() => null);
    if (!member) return i.reply({ content: emoji(i.guild,"error","❌")+" Usuario no encontrado.", ephemeral:true });
    const actor = await i.guild.members.fetch(i.user.id).catch(() => i.member);
    if (!canModerateTarget(actor, member, i.guild.ownerId)) {
      return i.reply({ content: emoji(i.guild,"error","❌")+" No puedes advertir al propietario, a ti mismo ni a alguien con un rol igual o superior al tuyo.",ephemeral:true });
    }
    const warning = warningService.addWarning({
      guildId: i.guild.id,
      userId: user.id,
      moderatorId: i.user.id,
      moderatorTag: i.user.tag,
      reason
    });
    const embed = new EmbedBuilder().setColor(config.colors.warning).setTitle(emoji(i.guild,"warning","⚠️")+" Advertencia").setDescription("Has recibido una advertencia en **"+i.guild.name+"**.").addFields({name:"ID de advertencia",value:warning.id,inline:true},{name:"Motivo",value:reason},{name:"Moderador",value:i.user.tag});
    await user.send({embeds:[embed]}).catch(()=>{});
    const log = i.guild.channels.cache.get(config.channels.logs);
    if (log) await log.send({embeds:[embed.addFields({name:"Usuario",value:user.tag+" ("+user.id+")"}).setFooter({text:"FLUX STORE • Advertencia "+warning.id+" guardada"})]}).catch(()=>{});
    return i.reply({ content: emoji(i.guild,"warning","⚠️")+" "+user+" ha recibido una advertencia.", ephemeral:false });
  }
};
