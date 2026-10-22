"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
process.env.VELO_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "flux-warnings-test-"));
const { addWarning, listWarnings, clearWarnings } = require("../utils/warnings-service");
const { writeJSON } = require("../storage");
function reset() { writeJSON("flux-store-warnings.json", { nextId: 1, entries: [] }); }
test.beforeEach(reset);
test("warnings receive IDs, timestamps and are scoped to a guild and user", () => {
  const first = addWarning({ guildId: "g1", userId: "u1", moderatorId: "m1", reason: "Spam" });
  const second = addWarning({ guildId: "g1", userId: "u1", moderatorId: "m2", reason: "Repeated spam" });
  addWarning({ guildId: "g2", userId: "u1", moderatorId: "m3", reason: "Other guild" });
  assert.equal(first.id, "W000001");
  assert.ok(first.createdAt);
  assert.equal(second.id, "W000002");
  assert.equal(listWarnings("g1", "u1").length, 2);
  assert.equal(listWarnings("g2", "u1").length, 1);
  assert.equal(listWarnings("g1", "u2").length, 0);
});
test("clearing warnings only affects the selected guild member pair", () => {
  addWarning({ guildId: "g1", userId: "u1", moderatorId: "m1" });
  addWarning({ guildId: "g1", userId: "u1", moderatorId: "m1" });
  addWarning({ guildId: "g1", userId: "u2", moderatorId: "m1" });
  assert.equal(clearWarnings("g1", "u1"), 2);
  assert.equal(listWarnings("g1", "u1").length, 0);
  assert.equal(listWarnings("g1", "u2").length, 1);
  assert.equal(clearWarnings("g1", "u1"), 0);
});
test("warning record input requires guild, user and moderator IDs", () => {
  assert.throws(() => addWarning({ userId: "u", moderatorId: "m" }), /required/);
});
