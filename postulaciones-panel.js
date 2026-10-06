const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const config=require("./config");
const {emoji}=require("./ui");

module.exports={
 data:new SlashCommandBuilder().setName("postulaciones-panel").setDescription("Publica el panel para postularse.").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
 async execute(i){
   const embed=new EmbedBuilder().setColor(config.colors.primary).setTitle(emoji(i.guild,"users","👥")+" Postulaciones — Velo Studio").setDescription("¿Quieres formar parte del equipo?\n\nPulsa **Postularme** para abrir un canal privado y responder las preguntas.");
   const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("application_panel_open").setLabel("Postularme").setStyle(ButtonStyle.Success).setEmoji(emoji(i.guild,"add","➕")));
   await i.channel.send({embeds:[embed],components:[row]});
   return i.reply({content:emoji(i.guild,"success","✅")+" Panel de postulaciones enviado.",ephemeral:true});
 }
};
