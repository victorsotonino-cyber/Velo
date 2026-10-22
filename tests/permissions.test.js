"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { PermissionFlagsBits } = require("discord.js");
const { canManageStore, canManageTickets } = require("../utils/permissions");

const config = { roles: { admin: "role-admin", staff: "role-staff" } };

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

test("Discord Administrator and ManageGuild permission bits grant store access", () => {
  assert.equal(canManageStore(member({ permissions: [PermissionFlagsBits.Administrator] }), config), true);
  assert.equal(canManageStore(member({ permissions: [PermissionFlagsBits.ManageGuild] }), config), true);
});

test("ticket management accepts configured staff or ManageChannels", () => {
  assert.equal(canManageTickets(member({ roleIds: ["role-staff"] }), config), true);
  assert.equal(canManageTickets(member({ permissions: [PermissionFlagsBits.ManageChannels] }), config), true);
  assert.equal(canManageTickets(member(), config), false);
});
