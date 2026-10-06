const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const config = require("./config");
const { emoji } = require("./ui");

module.exports = {
  data: new SlashCommandBuilder().setName("postulaciones").setDescription("Abre tu postulación privada."),
  async execute(i) {
    const member=i.member;
    const memberRole=config.roles.member;
    if (memberRole && !member.roles.cache.has(memberRole) && !member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return i.reply({content:emoji(i.guild,"error","❌")+" Este comando es para miembros.",ephemeral:true});
    }
    const old=i.guild.channels.cache.find(c=>c.type===0 && c.topic==="VeloApplication:"+i.user.id);
    if(old) return i.reply({content:emoji(i.guild,"info","ℹ️")+" Ya tienes una postulación abierta: "+old,ephemeral:true});
    const staff=i.guild.roles.cache.get(config.roles.staff);
    const parent=i.guild.channels.cache.get(config.channels.tickets);
    const ch=await i.guild.channels.create({
      name:"postulacion-"+i.user.username.toLowerCase().replace(/[^a-z0-9-]/g,"").slice(0,18),
      type:0,
      topic:"VeloApplication:"+i.user.id,
      parent:parent?.type===4?parent.id:null,
      permissionOverwrites:[
        {id:i.guild.roles.everyone.id,deny:["ViewChannel"]},
        {id:i.user.id,allow:["ViewChannel","SendMessages","ReadMessageHistory"]},
        ...(staff?[{id:staff.id,allow:["ViewChannel","SendMessages","ReadMessageHistory"]}]:[])
      ]
    });
    const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("application_start").setLabel("Comenzar").setStyle(ButtonStyle.Primary));
    await ch.send({content:i.user+(staff?" <@&"+staff.id+">":""),embeds:[new EmbedBuilder().setColor(config.colors.primary).setTitle(emoji(i.guild,"edit","✏️")+" Postulación").setDescription("Bienvenido/a. Pulsa **Comenzar** y responde las preguntas una por una.")],components:[row]});
    return i.reply({content:emoji(i.guild,"success","✅")+" Tu postulación fue creada: "+ch,ephemeral:true});
  }
};
