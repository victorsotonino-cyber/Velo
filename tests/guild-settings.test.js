"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "velo-guild-settings-"));
process.env.FLUX_STORE_DATA_DIR = tempDir;

const {
  DEFAULTS,
  getGuildSettings,
  updateGuildSettings
} = require("../guild-settings");

const GUILD_A = "123456789012345678";
const GUILD_B = "123456789012345679";

test("server settings default independently for every guild", () => {
  assert.deepEqual(getGuildSettings(GUILD_A), { ...DEFAULTS });
  assert.deepEqual(getGuildSettings(GUILD_B), { ...DEFAULTS });
});

test("settings persist and remain isolated between guilds", () => {
  updateGuildSettings(GUILD_A, {
    welcomeChannelId: "123456789012345670",
    welcomeDisabled: false,
    autoroleId: "123456789012345671",
    automodEnabled: false,
    auditEnabled: true
  });

  const settingsA = getGuildSettings(GUILD_A);
  assert.equal(settingsA.welcomeChannelId, "123456789012345670");
  assert.equal(settingsA.autoroleId, "123456789012345671");
  assert.equal(settingsA.automodEnabled, false);
  assert.equal(settingsA.auditEnabled, true);
  assert.deepEqual(getGuildSettings(GUILD_B), { ...DEFAULTS });

  const savedFile = path.join(tempDir, "guild-settings.json");
  assert.equal(fs.existsSync(savedFile), true);
});

test("settings reject invalid server IDs, invalid channel IDs and unknown keys", () => {
  assert.throws(() => updateGuildSettings("not-a-guild", { auditEnabled: false }), /ID de servidor/);
  assert.throws(() => updateGuildSettings(GUILD_A, { logsChannelId: "bad-id" }), /ID válido/);
  assert.throws(() => updateGuildSettings(GUILD_A, { untrusted: true }), /Ajuste no permitido/);
  assert.throws(() => updateGuildSettings(GUILD_A, { auditEnabled: "false" }), /booleano/);
});

test.after(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});
