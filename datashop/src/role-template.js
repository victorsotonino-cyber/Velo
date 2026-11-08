const { PermissionFlagsBits: P } = require('discord.js');

const DEFINITIONS = [
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

module.exports = async function createRoleTemplate(guild, config) {
  const me = guild.members.me || await guild.members.fetchMe();
  if (!me.permissions.has(P.ManageRoles)) throw new Error('El bot necesita el permiso Administrar roles.');
  const result = { created:0, existing:0, roles:[] };
  for (const def of DEFINITIONS) {
    let role = guild.roles.cache.find(r => r.name.toLowerCase() === def.name.toLowerCase());
    if (!role) {
      role = await guild.roles.create({
        name:def.name, color:def.color, permissions:def.permissions,
        mentionable:false,
        hoist:['OWNER','MANAGER','COORDINADOR','ADMIN','MODERADOR','SOPORTE','STAFF','SELLER'].includes(def.name),
        reason:'Plantilla profesional de roles DATASHOP'
      });
      result.created++;
    } else result.existing++;
    config.roles[def.key] = role.id;
    result.roles.push({ name:def.name, emoji:def.emoji, id:role.id });
  }
  return result;
};
