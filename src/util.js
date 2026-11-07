const {EmbedBuilder,PermissionFlagsBits:P}=require('discord.js');const {settings}=require('./database');
const embed=(g,title,description='')=>new EmbedBuilder().setColor(settings(g.id).color||'#7c3aed').setTitle(title).setDescription(description).setFooter({text:settings(g.id).store_name||'DATASHOP'}).setTimestamp();
const staff=(m)=>!!m&&(m.permissions.has(P.Administrator)||m.permissions.has(P.ManageChannels));
const admin=(m)=>!!m&&m.permissions.has(P.Administrator);
const duration=(s)=>{const x=/^(\d+)(s|m|h|d)$/i.exec(s||'');return x?Number(x[1])*({s:1000,m:60000,h:3600000,d:86400000}[x[2].toLowerCase()]):0};
const money=(id,n)=>new Intl.NumberFormat('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n)+' '+settings(id).currency;
const reply=(m,content)=>m.reply({content,allowedMentions:{parse:[],repliedUser:false}});
module.exports={embed,staff,admin,duration,money,reply,P};
