"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { PermissionFlagsBits } = require("discord.js");
const { canManageStore, canManageTickets, canModerateTarget } = require("../utils/permissions");

const config = { roles: { admin: "role-admin", staff: "role-staff" } };


function moderationMember(id, highestPosition, permissions = []) {
  const grants = new Set(permissions);
  return {
    id,
    permissions: { has: permission => grants.has(permission) },
    roles: { highest: { position: highestPosition } }
  };
}

function member({ permissions = [], roleIds = [], roleNames = [] } = {}) {
  const grants = new Set(permissions);
  const roles = new Set(roleIds);
  return {
    permissions: { has: permission => grants.has(permission) },
    roles: {
      cache: {
        has: id => roles.has(id),
        some: predicate => roleNames.some(name => predicate({ name }))
      }
    }
  };
}

test("store staff accepts only configured staff/admin role IDs", () => {
  assert.equal(canManageStore(member({ roleIds: ["role-staff"] }), config), true);
  assert.equal(canManageStore(member({ roleIds: ["role-admin"] }), config), true);
  assert.equal(canManageStore(member({ roleIds: ["another-role"] }), config), false);
});

test("matching a privileged display name does not grant store access", () => {
  const user = member({ roleIds: ["fake-owner-role"], roleNames: ["✦ ᴏᴡɴᴇʀ"] });
  assert.equal(canManageStore(user, config), false);
});

test("raw Discord interaction member supports string permissions and role arrays", () => {
  const rawMember = {
    permissions: String(PermissionFlagsBits.ManageGuild),
    roles: ["role-staff"]
  };
  assert.equal(canManageStore(rawMember, config), true);
});

test("Discord Administrator and ManageGuild permission bits grant store access", () => {
  assert.equal(canManageStore(member({ permissions: [PermissionFlagsBits.Administrator] }), config), true);
  assert.equal(canManageStore(member({ permissions: [PermissionFlagsBits.ManageGuild] }), config), true);
});

test("ticket management accepts configured staff or ManageChannels", () => {
  assert.equal(canManageTickets(member({ roleIds: ["role-staff"] }), config), true);
  assert.equal(canManageTickets(member({ permissions: [PermissionFlagsBits.ManageChannels] }), config), true);
  assert.equal(canManageTickets(member(), config), false);
});


test("moderation hierarchy allows lower roles and blocks equal or higher roles", () => {
  const actor = moderationMember("moderator", 5);
  assert.equal(canModerateTarget(actor, moderationMember("member", 2), "owner"), true);
  assert.equal(canModerateTarget(actor, moderationMember("peer", 5), "owner"), false);
  assert.equal(canModerateTarget(actor, moderationMember("admin", 8), "owner"), false);
});

test("moderation never targets self or guild owner; guild owner can moderate other members", () => {
  const actor = moderationMember("moderator", 5);
  assert.equal(canModerateTarget(actor, moderationMember("moderator", 5), "owner"), false);
  assert.equal(canModerateTarget(actor, moderationMember("owner", 10), "owner"), false);
  assert.equal(canModerateTarget(moderationMember("owner", 10), moderationMember("member", 10), "owner"), true);
});

test("Administrator bypasses role hierarchy but not self or guild owner protection", () => {
  const admin = moderationMember("admin-user", 2, [PermissionFlagsBits.Administrator]);
  assert.equal(canModerateTarget(admin, moderationMember("higher", 10), "owner"), true);
  assert.equal(canModerateTarget(admin, moderationMember("admin-user", 2), "owner"), false);
  assert.equal(canModerateTarget(admin, moderationMember("owner", 10), "owner"), false);
});
