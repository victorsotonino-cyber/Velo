const { Events, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("./config");
const { readJSON } = require("./storage");

const FILE = "gifted-systems.json";
function allConfig() {
  const value = readJSON(FILE, {});
  return value && typeof value === "object" ? value : {};
}
function guildConfig(guildId) { return allConfig()[guildId] || {}; }
function format(template, member) {
  return String(template || "¡Bienvenido {user} a {server}! Ya somos {count} miembros.")
    .replaceAll("{user}", member.toString())
    .replaceAll("{server}", member.guild.name)
    .replaceAll("{count}", String(member.guild.memberCount || 0))
    .replaceAll("{avatar}", member.displayAvatarURL({size:256}));
}
module.exports = function registerGiftedEvents(client) {
  client.on(Events.GuildMemberAdd, async member => {
    const saved = guildConfig(member.guild.id);
    if (saved.autoroleId) {
      const role = member.guild.roles.cache.get(saved.autoroleId);
      const me = member.guild.members.me;
      if (role && me?.permissions.has(PermissionFlagsBits.ManageRoles) && role.position < me.roles.highest.position) {
        await member.roles.add(role, "Autorrol configurado").catch(err => console.error("Autorrol:", err.message));
      }
    }
    const channel = saved.welcomeChannelId && member.guild.channels.cache.get(saved.welcomeChannelId);
    if (channel?.isTextBased()) {
      const message = format(saved.welcomeMessage, member);
      const welcomeEmbed = new EmbedBuilder()
        .setColor(config.colors?.primary || 0x8B5CF6)
        .setTitle("¡Bienvenido/a!")
        .setDescription(message)
        .setThumbnail(member.displayAvatarURL({size:256}))
        .setFooter({text:member.guild.name+" • Miembro #"+member.guild.memberCount})
        .setTimestamp();
      await channel.send({embeds:[welcomeEmbed],allowedMentions:{users:[member.id]}}).catch(err=>console.error("Bienvenida:",err.message));
    }
    const ids=saved.statsChannelIds||{};
    const count=member.guild.memberCount||0;
    const humans=member.guild.members.cache.filter(m=>!m.user.bot).size;
    const bots=member.guild.members.cache.filter(m=>m.user.bot).size;
    for(const [key,name] of [["members","👥 Miembros: "+count],["humans","🧑 Usuarios: "+humans],["bots","🤖 Bots: "+bots]]) {
      const ch=ids[key]&&member.guild.channels.cache.get(ids[key]);
      if(ch?.setName) await ch.setName(name).catch(()=>{});
    }
  });

  client.on(Events.GuildMemberRemove, async member => {
    const saved=guildConfig(member.guild.id);
    const channel=saved.welcomeChannelId&&member.guild.channels.cache.get(saved.welcomeChannelId);
    if(saved.goodbyeEnabled&&channel?.isTextBased()) {
      await channel.send({embeds:[new EmbedBuilder().setColor(config.colors?.primary||0x8B5CF6).setTitle("Hasta pronto").setDescription("👋 "+member.user.tag+" ha salido de **"+member.guild.name+"**.").setThumbnail(member.displayAvatarURL({size:256})).setTimestamp()],allowedMentions:{parse:[]}}).catch(()=>{});
    }
  });

  client.on(Events.MessageCreate, async message => {
    if(!message.guild||message.author.bot||!message.content.startsWith("!")) return;
    const name=message.content.slice(1).trim().split(/\s+/)[0]?.toLowerCase();
    if(!name) return;
    const saved=guildConfig(message.guild.id);
    const response=saved.customCommands?.[name];
    if(response) await message.reply({content:String(response).slice(0,1900),allowedMentions:{parse:[]}}).catch(()=>{});
  });

  client.on(Events.InteractionCreate, async interaction => {
    if(!interaction.isModalSubmit()||!interaction.customId.startsWith("gift_application:")) return;
    if(!interaction.inGuild()) return interaction.reply({content:"Solo puedes enviar una postulación dentro del servidor.",ephemeral:true});
    const saved=guildConfig(interaction.guildId);
    const channel=saved.applicationsChannelId&&interaction.guild.channels.cache.get(saved.applicationsChannelId);
    if(!channel?.isTextBased()) return interaction.reply({content:"El canal de postulaciones no está configurado. Usa /setup-applications.",ephemeral:true});
    const type=interaction.customId.split(":")[1]||"Staff";
    const fields=[
      ["Nombre y edad",interaction.fields.getTextInputValue("name_age")],
      ["Experiencia",interaction.fields.getTextInputValue("experience")],
      ["Portfolio",interaction.fields.getTextInputValue("portfolio")],
      ["Disponibilidad",interaction.fields.getTextInputValue("availability")],
      ["Motivación",interaction.fields.getTextInputValue("reason")]
    ];
    const embed=new EmbedBuilder().setColor(config.colors?.primary||0x8B5CF6)
      .setTitle("📨 Nueva postulación · "+type)
      .setDescription("Solicitante: <@"+interaction.user.id+">")
      .addFields(fields.map(([name,value])=>({name,value:String(value).slice(0,1024),inline:false})))
      .setFooter({text:"ID: "+interaction.user.id}).setTimestamp();
    await channel.send({embeds:[embed],allowedMentions:{parse:[]}});
    return interaction.reply({content:"✅ Tu postulación se ha enviado al equipo para su revisión.",ephemeral:true});
  });
};
