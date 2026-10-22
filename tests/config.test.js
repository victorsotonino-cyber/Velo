"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

test("blank numeric environment variables preserve documented defaults", () => {
  const script = [
    'const config = require("./config");',
    'console.log(JSON.stringify({ tickets: config.ticket.maxOpenPerUser, delay: config.ticket.closeDelayMs, automod: config.automod }));'
  ].join("\n");

  const env = {
    ...process.env,
    MAX_TICKETS_PER_USER: "",
    TICKET_CLOSE_DELAY_MS: "",
    AUTOMOD_MAX_MESSAGES: "",
    AUTOMOD_WINDOW_SECONDS: "",
    AUTOMOD_DUPLICATE_LIMIT: "",
    AUTOMOD_MAX_MENTIONS: "",
    AUTOMOD_TIMEOUT_MINUTES: ""
  };
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: path.resolve(__dirname, ".."),
    env,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, result.stderr || "Config subprocess failed.");
  const parsed = JSON.parse(result.stdout.trim());
  assert.equal(parsed.tickets, 2);
  assert.equal(parsed.delay, 5000);
  assert.equal(parsed.automod.maxMessages, 6);
  assert.equal(parsed.automod.windowSeconds, 7);
  assert.equal(parsed.automod.duplicateLimit, 3);
  assert.equal(parsed.automod.maxMentions, 5);
  assert.equal(parsed.automod.timeoutMinutes, 5);
});
