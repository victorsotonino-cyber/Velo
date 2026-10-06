const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const config=require("./config");
const {emoji}=require("./ui");
const fs=require("fs");
const path=require("path");
const file=path.join(__dirname,"postulaciones.json");

function load(){try{return JSON.parse(fs.readFileSync(file,"utf8"))}catch{return {questions:["¿Cuál es tu edad?","¿Por qué quieres entrar al Staff?","¿Qué experiencia tienes moderando servidores?","¿Cuánto tiempo puedes dedicar al servidor?","¿Por qué deberíamos aceptarte?"]}}}
function save(x){fs.writeFileSync(file,JSON.stringify(x,null,2));}
module.exports={
 data:new SlashCommandBuilder().setName("postulaciones-config").setDescription("Configura las preguntas de postulaciones.")
 .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
 .addSubcommand(s=>s.setName("agregar").setDescription("Agrega una pregunta al final.").addStringOption(o=>o.setName("pregunta").setDescription("Pregunta").setRequired(true).setMaxLength(500)))
 .addSubcommand(s=>s.setName("eliminar").setDescription("Elimina una pregunta por número.").addIntegerOption(o=>o.setName("numero").setDescription("Número de pregunta").setRequired(true).setMinValue(1).setMaxValue(25)))
 .addSubcommand(s=>s.setName("ver").setDescription("Muestra las preguntas actuales."))
 .addSubcommand(s=>s.setName("restablecer").setDescription("Restaura las preguntas predeterminadas.")),
 async execute(i){
  const data=load(), sub=i.options.getSubcommand();
  if(sub==="agregar"){data.questions.push(i.options.getString("pregunta"));if(data.questions.length>25)data.questions.shift();save(data);return i.reply(emoji(i.guild,"success","✅")+" Pregunta agregada. Hay **"+data.questions.length+"** preguntas.");}
  if(sub==="eliminar"){const n=i.options.getInteger("numero");if(n>data.questions.length)return i.reply({content:emoji(i.guild,"error","❌")+" No existe esa pregunta.",ephemeral:true});const q=data.questions.splice(n-1,1)[0];save(data);return i.reply(emoji(i.guild,"trash","🗑️")+" Eliminada: **"+q+"**");}
  if(sub==="restablecer"){const fresh={questions:["¿Cuál es tu edad?","¿Por qué quieres entrar al Staff?","¿Qué experiencia tienes moderando servidores?","¿Cuánto tiempo puedes dedicar al servidor?","¿Por qué deberíamos aceptarte?"]};save(fresh);return i.reply(emoji(i.guild,"success","✅")+" Preguntas restablecidas.");}
  const lines=data.questions.map((q,n)=>"**"+(n+1)+".** "+q).join("\n")||"Sin preguntas.";
  return i.reply({embeds:[new EmbedBuilder().setColor(config.colors.primary).setTitle(emoji(i.guild,"settings","⚙️")+" Preguntas de postulación").setDescription(lines)],ephemeral:true});
 }
};
