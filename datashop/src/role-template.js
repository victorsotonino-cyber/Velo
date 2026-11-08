const { PermissionFlagsBits: P, ChannelType } = require('discord.js');

const ROLES = [
  { key:'user', name:'USER', emoji:'👤', color:0x95A5A6, permissions:[] },
  { key:'buyer', name:'BUYER', emoji:'🛍️', color:0x3498DB, permissions:[] },
  { key:'seller', name:'SELLER', emoji:'💰', color:0x2ECC71, permissions:[] },
  { key:'staff', name:'STAFF', emoji:'🔧', color:0x1ABC9C, permissions:[] },
  { key:'support', name:'SOPORTE', emoji:'🎫', color:0x3498DB, permissions:[P.ManageMessages] },
  { key:'moderator', name:'MODERADOR', emoji:'🛡️', color:0x5865F2, permissions:[P.ModerateMembers,P.ManageMessages] },
  { key:'admin', name:'ADMIN', emoji:'🔴', color:0xE74C3C, permissions:[P.KickMembers,P.BanMembers,P.ModerateMembers,P.ManageMessages,P.ViewAuditLog] },
  { key:'coordinator', name:'COORDINADOR', emoji:'🎯', color:0x9B59B6, permissions:[P.ManageChannels,P.ManageMessages,P.ManageThreads,P.ViewAuditLog] },
  { key:'manager', name:'MANAGER', emoji:'💠', color:0x8E44AD, permissions:[P.ManageGuild,P.ManageRoles,P.ManageChannels,P.ViewAuditLog] },
  { key:'owner', name:'OWNER', emoji:'👑', color:0xF1C40F, permissions:[P.Administrator] }
];

const GROUPS = [
  { key:'informacion', name:'📌 INFORMACIÓN', channels:[
    ['welcome','👋・welcome'],['invites','📨・invites'],['reward','🎁・reward'],
    ['new','📢・new'],['term','📜・term'],['web','🌐・web']
  ]},
  { key:'tienda', name:'🛒 TIENDA', channels:[
    ['ticket','🎫・ticket'],['restock','📦・restock'],['proof','🧾・proof'],
    ['legit','✅・legit'],['vouch','⭐・vouch']
  ]},
  { key:'comunidad', name:'💬 COMUNIDAD', channels:[
    ['chat','💬・chat'],['multimedia','🎬・multimedia']
  ]},
  { key:'equipo', name:'🛡️ EQUIPO', channels:[
    ['comando','🤖・comando']
  ]}
];

module.exports = async function createServerTemplate(guild, config) {
  const me = guild.members.me || await guild.members.fetchMe();
  if (!me.permissions.has(P.ManageRoles) || !me.permissions.has(P.ManageChannels)) {
    throw new Error('El bot necesita Administrar roles y Administrar canales.');
  }

  const result = { rolesCreated:0, rolesExisting:0, channelsCreated:0, channelsExisting:0, roles:[], channels:[], categories:[] };

  for (const def of ROLES) {
    let role = guild.roles.cache.find(r => r.name.toLowerCase() === def.name.toLowerCase());
    if (!role) {
      role = await guild.roles.create({
        name:def.name, color:def.color, permissions:def.permissions,
        mentionable:false,
        hoist:['OWNER','MANAGER','COORDINADOR','ADMIN','MODERADOR','SOPORTE','STAFF','SELLER'].includes(def.name),
        reason:'Plantilla profesional DATASHOP'
      });
      result.rolesCreated++;
    } else result.rolesExisting++;
    config.roles[def.key] = role.id;
    result.roles.push({ name:def.name, emoji:def.emoji, id:role.id });
  }

  for (const group of GROUPS) {
    let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === group.name);
    if (!category) category = await guild.channels.create({name:group.name,type:ChannelType.GuildCategory,reason:'Categorías de la plantilla DATASHOP'});
    result.categories.push({name:group.name,id:category.id});

    for (const [key,channelName] of group.channels) {
      let channel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === channelName && c.parentId === category.id);
      if (!channel) {
        const options = {
          name:channelName,
          type:ChannelType.GuildText,
          parent:category.id,
          reason:'Canales de la plantilla DATASHOP'
        };
        if (key === 'comando') {
          const staffRoleIds = ['owner','manager','coordinator','admin','moderator','support','staff'].map(k => config.roles[k]).filter(Boolean);
          options.permissionOverwrites = [
            { id:guild.roles.everyone.id, deny:[P.ViewChannel] },
            ...staffRoleIds.map(id => ({id,allow:[P.ViewChannel,P.SendMessages,P.ReadMessageHistory]})),
            { id:me.id, allow:[P.ViewChannel,P.SendMessages,P.ReadMessageHistory,P.ManageChannels] }
          ];
        }
        channel = await guild.channels.create(options);
        result.channelsCreated++;
      } else result.channelsExisting++;
      config.channels[key] = channel.id;
      result.channels.push({name:channel.name,key,id:channel.id,category:category.name});
    }
  }

  return result;
};
