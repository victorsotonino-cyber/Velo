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
  const jsonLine = result.stdout.split(/\r?\n/).find(line => line.trim().startsWith("{") && line.trim().endsWith("}"));
  assert.ok(jsonLine, "Config subprocess did not return its JSON payload: " + result.stdout);
  const parsed = JSON.parse(jsonLine);
  assert.equal(parsed.tickets, 2);
  assert.equal(parsed.delay, 5000);
  assert.equal(parsed.automod.maxMessages, 6);
  assert.equal(parsed.automod.windowSeconds, 7);
  assert.equal(parsed.automod.duplicateLimit, 3);
  assert.equal(parsed.automod.maxMentions, 5);
  assert.equal(parsed.automod.timeoutMinutes, 5);
});

test("FLUX STORE channel defaults point to the configured terms, payments, ticket and welcome channels", () => {
  const script = [
    'const config = require("./config");',
    'console.log(JSON.stringify({ welcome: config.channels.welcome, terms: config.channels.terms, paymentMethods: config.channels.paymentMethods, ticketInfo: config.channels.ticketInfo, transactions: config.channels.transactions }));'
  ].join("\n");
  const env = {
    ...process.env,
    WELCOME_CHANNEL_ID: "",
    TERMS_CHANNEL_ID: "",
    PAYMENT_METHODS_CHANNEL_ID: "",
    TICKET_INFO_CHANNEL_ID: "",
    TRANSACTIONS_CHANNEL_ID: ""
  };
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: path.resolve(__dirname, ".."),
    env,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || "Config subprocess failed.");
  const jsonLine = result.stdout.split(/\r?\n/).find(line => line.trim().startsWith("{") && line.trim().endsWith("}"));
  assert.ok(jsonLine, "Config subprocess did not return its JSON payload: " + result.stdout);
  assert.deepEqual(JSON.parse(jsonLine), {
    welcome: "1562615450834178179",
    terms: "1562615455624077383",
    paymentMethods: "1562615459256471642",
    ticketInfo: "1562615495704838174",
    transactions: "1562615500968820802"
  });
});

test("valid environment channel IDs can override FLUX STORE defaults", () => {
  const script = [
    'const config = require("./config");',
    'console.log(JSON.stringify({ welcome: config.channels.welcome, terms: config.channels.terms, paymentMethods: config.channels.paymentMethods, ticketInfo: config.channels.ticketInfo, transactions: config.channels.transactions }));'
  ].join("\n");
  const env = {
    ...process.env,
    WELCOME_CHANNEL_ID: "12345678901234567",
    TERMS_CHANNEL_ID: "12345678901234568",
    PAYMENT_METHODS_CHANNEL_ID: "12345678901234569",
    TICKET_INFO_CHANNEL_ID: "12345678901234570",
    TRANSACTIONS_CHANNEL_ID: "12345678901234571"
  };
  const result = spawnSync(process.execPath, ["-e", script], {
    cwd: path.resolve(__dirname, ".."),
    env,
    encoding: "utf8"
  });
  assert.equal(result.status, 0, result.stderr || "Config subprocess failed.");
  const jsonLine = result.stdout.split(/\r?\n/).find(line => line.trim().startsWith("{") && line.trim().endsWith("}"));
  assert.ok(jsonLine, "Config subprocess did not return its JSON payload: " + result.stdout);
  assert.deepEqual(JSON.parse(jsonLine), {
    welcome: "12345678901234567",
    terms: "12345678901234568",
    paymentMethods: "12345678901234569",
    ticketInfo: "12345678901234570",
    transactions: "12345678901234571"
  });
});
