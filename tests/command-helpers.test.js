"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { formatDuration, parseHexColor, getTicketStats, canManageRole, isValidUnixSeconds } = require("../utils/command-helpers");

test("formatDuration returns readable uptime segments", () => {
  assert.equal(formatDuration(0), "0 s");
  assert.equal(formatDuration(61000), "1 min 1 s");
  assert.equal(formatDuration(90061000), "1 d 1 h 1 min 1 s");
});
test("parseHexColor accepts six-digit hex and rejects invalid values", () => {
  assert.equal(parseHexColor("#8B5CF6"), 0x8B5CF6);
  assert.equal(parseHexColor("ffffff"), 0xFFFFFF);
  assert.equal(parseHexColor("#FFF"), null);
  assert.equal(parseHexColor("red"), null);
});
test("getTicketStats only counts valid ticket topics", () => {
  const stats = getTicketStats([
    { topic: "VeloTicket:12345678901234567:compras" },
    { topic: "VeloTicket:12345678901234567:compras:staff-id" },
    { topic: "VeloTicket:22345678901234567:dudas" },
    { topic: "Other:12345678901234567:compras" },
    { topic: "VeloTicket:not-an-id:reportes" },
    { topic: null }
  ]);
  assert.deepEqual(stats, { total: 3, uniqueOwners: 2, categories: { compras: 2, dudas: 1 } });
});
test("role hierarchy blocks managed, bot-top and peer or higher roles", () => {
  const bot = { roles: { highest: { position: 10 } } };
  const actor = { id: "moderator", roles: { highest: { position: 7 } } };
  assert.equal(canManageRole(actor, bot, { position: 3, managed: false }, "owner"), true);
  assert.equal(canManageRole(actor, bot, { position: 7, managed: false }, "owner"), false);
  assert.equal(canManageRole(actor, bot, { position: 10, managed: false }, "owner"), false);
  assert.equal(canManageRole(actor, bot, { position: 2, managed: true }, "owner"), false);
  assert.equal(canManageRole({ id: "owner" }, bot, { position: 3, managed: false }, "owner"), true);
  assert.equal(canManageRole(actor, bot, { id: "g", guild: { id: "g" }, position: 0, managed: false }, "owner"), false);
});
test("Unix timestamp input stays within the supported range", () => {
  assert.equal(isValidUnixSeconds("0"), true);
  assert.equal(isValidUnixSeconds("4102444800"), true);
  assert.equal(isValidUnixSeconds("-1"), false);
  assert.equal(isValidUnixSeconds("4102444801"), false);
  assert.equal(isValidUnixSeconds("1.5"), false);
  assert.equal(isValidUnixSeconds(""), false);
});
