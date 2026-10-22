const { PermissionFlagsBits } = require("discord.js");

const DEFAULT_STORE_STAFF_NAMES = new Set([
  "✦ ᴏᴡɴᴇʀ",
  "✦ ᴍᴀɴᴀɢᴇʀ",
  "✦ ᴀᴅᴍɪɴ",
  "✦ ʜᴇᴀᴅ sᴛᴀғғ",
  "✦ sᴜᴘᴘᴏʀᴛ"
]);

function hasRole(member, roleId) {
  return Boolean(roleId && member?.roles?.cache?.has(roleId));
}

function hasPermission(member, permission) {
  return Boolean(member?.permissions?.has(permission));
}

function isStoreStaff(member, config) {
  if (!member) return false;
  if (hasPermission(member, PermissionFlagsBits.Administrator) ||
      hasPermission(member, PermissionFlagsBits.ManageGuild)) return true;

  if (hasRole(member, config.roles?.admin) || hasRole(member, config.roles?.staff)) return true;

  const roles = member.roles?.cache;
  return Boolean(roles?.some(role => DEFAULT_STORE_STAFF_NAMES.has(role.name)));
}

function isTicketStaff(member, config) {
  if (!member) return false;
  return hasPermission(member, PermissionFlagsBits.ManageChannels) ||
    hasRole(member, config.roles?.admin) ||
    hasRole(member, config.roles?.staff);
}

function canManageMessages(member) {
  return hasPermission(member, PermissionFlagsBits.Administrator) ||
    hasPermission(member, PermissionFlagsBits.ManageMessages);
}

module.exports = {
  hasRole,
  hasPermission,
  isStoreStaff,
  isTicketStaff,
  canManageMessages
};
