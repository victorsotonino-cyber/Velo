const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");

const BASE = "https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/";
const PACKS = {
  moderacion: ["mod_ban","🔨","mod_kick","👢","mod_mute","🔇","mod_warn","⚠️","mod_lock","🔒","mod_unlock","🔓","mod_report","🚨","mod_logs","📋"],
  owner: ["owner","👑","owner_star","⭐","owner_server","🏰","owner_settings","⚙️","owner_check","✅"],
  staff: ["staff","🛡️","staff_team","👥","staff_check","☑️","staff_help","🙋","staff_support","🎧","staff_tools","🧰","staff_online","🟢","staff_offline","🔴"],
  reclamar: ["ticket","🎫","ticket_claim","✋","ticket_open","📂","ticket_close","📁","ticket_lock","🔒","ticket_unlock","🔓","ticket_reply","💬","ticket_wait","⏳"],
  meme: ["meme_laugh","😂","meme_lmao","🤣","meme_skull","💀","meme_cry","😭","meme_eyes","👀","meme_fire","🔥","meme_sus","🤨"],
  utilidad: ["success","✅","error","❌","info","ℹ️","loading","🔄","arrow","➡️","star","⭐","bell","🔔","gift","🎁"]
};
const LABELS = { moderacion:"🛡️ Moderación", owner:"👑 Owner", staff:"🛡️ Staff", reclamar:"🎫 Reclamar / Tickets", meme:"😂 Meme", utilidad:"⚙️ Utilidad" };
const choices = Object.entries(LABELS).map(([name,label]) => ({name,label,value:name}));
choices.push({name:"📦 Todo",value:"todo"});
function url(char) { return BASE + Array.from(char).map(c => c.codePointAt(0).toString(16)).join("-") + ".png"; }
async function install(guild, pack) {
  const created=[], existing=[], failed=[];
  for (let n=0; n<pack.length; n+=2) {
    const name=pack[n], char=pack[n+1];
    if (guild.emojis.cache.some(e => e.name === name)) { existing.push(name); continue; }
    try {
      const res=await fetch(url(char));
      if (!res.ok) throw new Error("download");
      const e=await guild.emojis.create({attachment:Buffer.from(await res.arrayBuffer()),name,reason:"Velo Studio emoji pack"});
      created.push("<:"+e.name+":"+e.id+">");
    } catch { failed.push(name); }
  }
  return {created,existing,failed};
}
module.exports = {
  data: new SlashCommandBuilder().setName("emojis-pack").setDescription("Instala packs de emojis de Velo Studio.").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions).addStringOption(o=>o.setName("pack").setDescription("Elige el pack").setRequired(true).addChoices(...choices)),
  async execute(i) {
    if (!i.guild) return i.reply({content:"❌ Solo funciona en un servidor.",ephemeral:true});
    if (!i.guild.members.me?.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) return i.reply({content:"❌ Necesito Administrar expresiones.",ephemeral:true});
    const selected=i.options.getString("pack",true);
    await i.deferReply({ephemeral:true});
    const keys=selected==="todo"?Object.keys(PACKS):[selected];
    const all={created:[],existing:[],failed:[]};
    for (const key of keys) { const r=await install(i.guild,PACKS[key]); all.created.push(...r.created); all.existing.push(...r.existing); all.failed.push(...r.failed); }
    const embed=new EmbedBuilder().setColor(0xE11D2E).setTitle("Velo Studio • Emoji Packs").setDescription("Pack instalado: **"+(selected==="todo"?"Todos":LABELS[selected])+"**").addFields({name:"✅ Instalados",value:all.created.length?all.created.join(" "):"Ninguno"},{name:"📦 Ya existían",value:all.existing.length?all.existing.map(x=>"`"+x+"`").join(", "):"Ninguno"},{name:"⚠️ Fallaron",value:all.failed.length?all.failed.map(x=>"`"+x+"`").join(", "):"Ninguno"}).setFooter({text:"Velo Studio • Emojis"}).setTimestamp();
    await i.editReply({embeds:[embed]});
  }
};