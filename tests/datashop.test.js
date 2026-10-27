const test = require("node:test");
const assert = require("node:assert/strict");

test("DATASHOP command modules expose valid slash commands", () => {
  const ping = require("../src/commands/ping");
  const help = require("../src/commands/help");
  for (const command of [ping, help]) {
    assert.equal(typeof command.data.toJSON, "function");
    assert.equal(typeof command.execute, "function");
  }
  assert.equal(ping.data.toJSON().name, "ping");
  assert.equal(help.data.toJSON().name, "help");
});
