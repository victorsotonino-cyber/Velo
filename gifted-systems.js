const {
  SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder,
  TextInputStyle, StringSelectMenuBuilder
} = require("discord.js");
const config = require("./config");
const { readJSON, writeJSON } = require("./storage");

const FILE = "gifted-systems.json";
const getData = () => {
  const data = readJSON(FILE, {});
  return data && typeof data === "object" ? data : {};
};
const getGuild = id => getData()[id] || {};
function saveGuild(id, patch) {
  const all = getData();
  all[id] = { ...(all[id] || {}), ...patch };
  writeJSON(FILE, all);
  return all[id];
}
function isAdmin(i) {
  return i.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    i.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}
function embed(title, description, color = config.colors?.primary || 0x8B5CF6) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(description).setTimestamp();
}
function channelOption(builder, name, description) {
  return builder.addChannelOption(o => o.setName(name).setDescription(description).addChannelTypes(ChannelType.GuildText).setRequired(true));
}
const setupCommands = [
  new SlashCommandBuilder().setName("setup-bienvenida").setDescription("Configura bienvenida, despedida y autorrol.")
    .addChannelOption(o => o.setName("canal").setDescription("Canal de bienvenida").addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption(o => o.setName("mensaje").setDescription("Usa {user}, {server} y {count}").setMaxLength(1500))
    .addRoleOption(o => o.setName("autorrol").setDescription("Rol automático para nuevos miembros"))
    .addBooleanOption(o => o.setName("despedidas").setDescription("Enviar despedidas en el mismo canal")),
  new SlashCommandBuilder().setName("setup-verificacion").setDescription("Configura canal y rol de verificación.")
    .addChannelOption(o => o.setName("canal").setDescription("Canal de verificación").addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addRoleOption(o => o.setName("rol_verificado").setDescription("Rol que recibe quien se verifica").setRequired(true)),
  new SlashCommandBuilder().setName("setup-moderacion").setDescription("Configura el rol de moderación y el canal de logs.")
    .addRoleOption(o => o.setName("rol_staff").setDescription("Rol autorizado para moderación"))
    .addChannelOption(o => o.setName("canal_logs").setDescription("Canal para registros").addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName("setup-applications").setDescription("Configura el canal para recibir postulaciones.")
    .addChannelOption(o => o.setName("canal").setDescription("Canal privado para revisar postulaciones").addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName("setup-stats").setDescription("Crea canales de estadísticas de miembros."),
  new SlashCommandBuilder().setName("setup-logs").setDescription("Configura el canal general de registros.")
    .addChannelOption(o => o.setName("canal").setDescription("Canal de registros").addChannelTypes(ChannelType.GuildText).setRequired(true)),
  new SlashCommandBuilder().setName("setup-help").setDescription("Muestra una guía de configuración del bot."),
  new SlashCommandBuilder().setName("setup-all").setDescription("Muestra qué sistemas puedes configurar en el servidor."),
  new SlashCommandBuilder().setName("stats").setDescription("Muestra las estadísticas actuales del servidor."),
  new SlashCommandBuilder().setName("custom").setDescription("Gestiona comandos personalizados.")
    .addSubcommand(s => s.setName("crear").setDescription("Crea un comando personalizado").addStringOption(o=>o.setName("nombre").setDescription("Nombre corto sin espacios").setRequired(true).setMaxLength(32)).addStringOption(o=>o.setName("respuesta").setDescription("Texto que responderá").setRequired(true).setMaxLength(1800)))
    .addSubcommand(s => s.setName("borrar").setDescription("Borra un comando personalizado").addStringOption(o=>o.setName("nombre").setDescription("Nombre del comando").setRequired(true)))
    .addSubcommand(s => s.setName("lista").setDescription("Lista los comandos personalizados")),
  new SlashCommandBuilder().setName("utility-info").setDescription("Consulta información de un usuario o servidor.")
    .addSubcommand(s => s.setName("usuario").setDescription("Información de un usuario").addUserOption(o=>o.setName("miembro").setDescription("Usuario a consultar")))
    .addSubcommand(s => s.setName("servidor").setDescription("Información del servidor"))
    .addSubcommand(s => s.setName("avatar").setDescription("Muestra el avatar de un usuario").addUserOption(o=>o.setName("miembro").setDescription("Usuario a consultar"))),
  new SlashCommandBuilder().setName("postular").setDescription("Abre un formulario de postulación.")
    .addStringOption(o => o.setName("tipo").setDescription("Área a la que quieres postularte").setRequired(true)
      .addChoices({name:"Staff",value:"Staff"},{name:"Editor",value:"Editor"},{name:"Diseñador",value:"Diseñador"}))
];

module.exports = {
  data: setupCommands[0],
  setupCommands,
  async execute(i, client) {
    const command = i.commandName;
    if (!i.inGuild()) return i.reply({content:"Este comando solo funciona dentro de un servidor.",ephemeral:true});
    if (command.startsWith("setup-") || command === "custom") {
      if (!isAdmin(i)) return i.reply({content:"Necesitas Administrador o Gestionar servidor.",ephemeral:true});
    }
    const guildId = i.guildId;
    const saved = getGuild(guildId);
    if (command === "setup-bienvenida") {
      const channel = i.options.getChannel("canal");
      const role = i.options.getRole("autorrol");
      saveGuild(guildId, {welcomeChannelId:channel.id, welcomeMessage:i.options.getString("mensaje") || "¡Bienvenido {user} a {server}! Ya somos {count} miembros.", autoroleId:role?.id || saved.autoroleId || null, goodbyeEnabled:i.options.getBoolean("despedidas") ?? false});
      return i.reply({embeds:[embed("✅ Bienvenida configurada", "Canal: "+channel+"\nAutorrol: "+(role || "Sin cambios")+"\nVariables: `{user}`, `{server}`, `{count}`.")],ephemeral:true});
    }
    if (command === "setup-verificacion") {
      const channel=i.options.getChannel("canal"), role=i.options.getRole("rol_verificado");
      saveGuild(guildId,{verificationChannelId:channel.id,verifiedRoleId:role.id});
      const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("gift_verify_start:"+role.id).setLabel("Verificarme").setStyle(ButtonStyle.Success));
      await channel.send({embeds:[embed("🔐 Verificación", "Pulsa el botón y completa la comprobación para recibir acceso.")],components:[row]});
      return i.reply({content:"Panel de verificación publicado en "+channel+".",ephemeral:true});
    }
    if (command === "setup-moderacion") {
      const role=i.options.getRole("rol_staff"), channel=i.options.getChannel("canal_logs");
      saveGuild(guildId,{moderationRoleId:role?.id || saved.moderationRoleId || null,logsChannelId:channel?.id || saved.logsChannelId || null});
      return i.reply({embeds:[embed("🛡️ Moderación configurada","Rol staff: "+(role||"Sin cambios")+"\nCanal de logs: "+(channel||"Sin cambios"))],ephemeral:true});
    }
    if (command === "setup-applications") {
      const channel=i.options.getChannel("canal"); saveGuild(guildId,{applicationsChannelId:channel.id});
      return i.reply({content:"Canal de postulaciones guardado: "+channel,ephemeral:true});
    }
    if (command === "setup-logs") {
      const channel=i.options.getChannel("canal"); saveGuild(guildId,{logsChannelId:channel.id});
      return i.reply({content:"Canal de registros configurado: "+channel,ephemeral:true});
    }
    if (command === "setup-stats") {
      await i.deferReply({ephemeral:true});
      let category=i.guild.channels.cache.find(c=>c.type===ChannelType.GuildCategory && c.name.toLowerCase().includes("estadística"));
      if(!category) category=await i.guild.channels.create({name:"📊 Estadísticas",type:ChannelType.GuildCategory});
      const specs=[["👥 Miembros: "+i.guild.memberCount,"members"],["🧑 Usuarios: "+i.guild.members.cache.filter(m=>!m.user.bot).size,"humans"],["🤖 Bots: "+i.guild.members.cache.filter(m=>m.user.bot).size,"bots"]];
      const ids={};
      for(const [name,key] of specs){let ch=i.guild.channels.cache.find(c=>c.type===ChannelType.GuildVoice && c.parentId===category.id && c.name.startsWith(name.split(":")[0])); if(!ch) ch=await i.guild.channels.create({name,type:ChannelType.GuildVoice,parent:category.id}); else await ch.setName(name);ids[key]=ch.id;}
      saveGuild(guildId,{statsCategoryId:category.id,statsChannelIds:ids});
      return i.editReply("Canales de estadísticas creados/actualizados. Activa el intent de miembros en el portal de Discord para mantener los recuentos precisos.");
    }
    if (command === "setup-help" || command === "setup-all") {
      return i.reply({embeds:[embed("⚙️ Guía de configuración",[
        "`/ticket-setup` — panel de tickets y ajustes avanzados",
        "`/setup-bienvenida` — bienvenida, despedidas y autorrol",
        "`/setup-verificacion` — panel de verificación",
        "`/setup-moderacion` y `/setup-logs` — moderación y registros",
        "`/setup-applications` — canal de postulaciones",
        "`/setup-stats` — canales de estadísticas",
        "`/custom crear`, `/custom borrar`, `/custom lista` — comandos personalizados",
        "`/utility-info usuario|servidor|avatar` — consultas rápidas",
        "`/stats` — estadísticas del servidor"
      ].join("\n"))],ephemeral:true});
    }
    if (command === "stats") {
      await i.guild.members.fetch().catch(()=>{});
      const humans=i.guild.members.cache.filter(m=>!m.user.bot).size, bots=i.guild.members.cache.filter(m=>m.user.bot).size;
      return i.reply({embeds:[embed("📊 Estadísticas de "+i.guild.name,"Miembros: **"+i.guild.memberCount+"**\nPersonas: **"+humans+"**\nBots: **"+bots+"**\nCanales: **"+i.guild.channels.cache.size+"**\nRoles: **"+i.guild.roles.cache.size+"**")]});
    }
    if (command === "custom") {
      const sub=i.options.getSubcommand(), all=getData(), entry=all[guildId]||{}, commands={...(entry.customCommands||{})};
      if(sub==="crear"){const name=i.options.getString("nombre").toLowerCase().replace(/\s+/g,"-"); if(!/^[a-z0-9_-]{1,32}$/.test(name))return i.reply({content:"Nombre inválido; usa letras, números, guiones o guion bajo.",ephemeral:true}); if(commands[name])return i.reply({content:"Ese comando ya existe.",ephemeral:true}); commands[name]=i.options.getString("respuesta");saveGuild(guildId,{customCommands:commands});return i.reply({content:"Comando guardado. Para ejecutarlo usa el comando de prefijo `!"+name+"`.",ephemeral:true});}
      if(sub==="borrar"){const name=i.options.getString("nombre").toLowerCase();if(!commands[name])return i.reply({content:"No existe ese comando.",ephemeral:true});delete commands[name];saveGuild(guildId,{customCommands:commands});return i.reply({content:"Comando eliminado.",ephemeral:true});}
      return i.reply({embeds:[embed("🧩 Comandos personalizados",Object.keys(commands).length?Object.keys(commands).map(n=>"`!"+n+"`").join(", "):"No hay comandos personalizados todavía.")],ephemeral:true});
    }
    if (command === "utility-info") {
      const sub=i.options.getSubcommand();
      if(sub==="servidor")return i.reply({embeds:[embed("🏠 "+i.guild.name,"ID: `"+i.guild.id+"`\nMiembros: "+i.guild.memberCount+"\nCreado: <t:"+Math.floor(i.guild.createdTimestamp/1000)+":D>\nDueño: <@"+i.guild.ownerId+">")]});
      if(sub==="avatar"){const u=i.options.getUser("miembro")||i.user;return i.reply({embeds:[new EmbedBuilder().setColor(config.colors?.primary||0x8B5CF6).setTitle("Avatar de "+u.username).setImage(u.displayAvatarURL({size:1024})).setURL(u.displayAvatarURL({size:1024}))]});}
      const m=i.options.getMember("miembro")||i.member;return i.reply({embeds:[embed("👤 Información de "+m.user.tag,"ID: `"+m.id+"`\nCuenta: <t:"+Math.floor(m.user.createdTimestamp/1000)+":D>\nIngreso: "+(m.joinedTimestamp?"<t:"+Math.floor(m.joinedTimestamp/1000)+":D>":"Desconocido")+"\nRoles: "+m.roles.cache.filter(r=>r.id!==i.guild.id).map(r=>r.toString()).slice(0,15).join(", "))]});
    }
    if (command === "postular") {
      const channelId=saved.applicationsChannelId;
      const channel=channelId && i.guild.channels.cache.get(channelId);
      if(!channel)return i.reply({content:"El canal no está configurado. Un administrador debe usar /setup-applications.",ephemeral:true});
      const modal=new ModalBuilder().setCustomId("gift_application:"+i.options.getString("tipo")).setTitle("Postulación · "+i.options.getString("tipo"));
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("name_age").setLabel("Nombre y edad").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("experience").setLabel("Experiencia").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("portfolio").setLabel("Portfolio o enlace (si aplica)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(300)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("availability").setLabel("Disponibilidad").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(300)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("reason").setLabel("¿Por qué quieres unirte?").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000))
      );
      return i.showModal(modal);
    }
  }
};
