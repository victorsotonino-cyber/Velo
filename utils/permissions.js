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

/**
 * Prevent moderators from acting on themselves, the guild owner, or members
 * with an equal/higher top role. Guild owner and Administrator are exceptions.
 */
function canModerateTarget(actor, target, guildOwnerId) {
  if (!actor || !target || !actor.id || !target.id) return false;
  if (actor.id === target.id || target.id === guildOwnerId) return false;
  if (actor.id === guildOwnerId) return true;
  if (hasPermission(actor, PermissionFlagsBits.Administrator)) return true;

  const actorPosition = actor.roles && actor.roles.highest && actor.roles.highest.position;
  const targetPosition = target.roles && target.roles.highest && target.roles.highest.position;
  if (!Number.isFinite(actorPosition) || !Number.isFinite(targetPosition)) return false;
  return targetPosition < actorPosition;
}

module.exports = {
  hasPermission,
  hasConfiguredRole,
  canManageStore,
  canManageTickets,
  canModerateTarget
};
