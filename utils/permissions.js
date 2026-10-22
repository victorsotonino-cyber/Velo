"use strict";

const { PermissionFlagsBits } = require("discord.js");

function hasPermission(member, permission) {
  try {
    return Boolean(member && member.permissions && member.permissions.has(permission));
  } catch (_) {
    return false;
  }
}

function hasConfiguredRole(member, roleIds) {
  const roles = member && member.roles && member.roles.cache;
  if (!roles || typeof roles.has !== "function") return false;
  return roleIds.filter(Boolean).some(id => roles.has(String(id)));
}

/**
 * Privileged store actions must use permission bits or configured role IDs.
 * Role display names are deliberately never used as an authorization signal.
 */
function canManageStore(member, config) {
  if (!member || !config) return false;

  if (
    hasPermission(member, PermissionFlagsBits.Administrator) ||
    hasPermission(member, PermissionFlagsBits.ManageGuild)
  ) return true;

  return hasConfiguredRole(member, [
    config.roles && config.roles.admin,
    config.roles && config.roles.staff
  ]);
}

function canManageTickets(member, config) {
  return canManageStore(member, config) ||
    hasPermission(member, PermissionFlagsBits.ManageChannels);
}

module.exports = {
  hasPermission,
  hasConfiguredRole,
  canManageStore,
  canManageTickets
};
