"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const modules = [
  "../botinfo", "../uptime", "../membercount", "../roleinfo", "../channelinfo",
  "../timestamp", "../poll", "../purge", "../nickname", "../rolemanager",
  "../permcheck", "../ticketstats", "../embed", "../topic", "../emojistats",
  "../banner", "../warnings", "../diagnostico", "../servericon", "../boosters", "../emoji-search"
];

test("each added command exports a serializable slash command and an execute function", () => {
  for (const modulePath of modules) {
    const command = require(modulePath);
    assert.ok(command.data, modulePath + " must export data");
    assert.equal(typeof command.execute, "function", modulePath + " must export execute");
    const json = command.data.toJSON();
    assert.ok(/^[a-z0-9_-]{1,32}$/.test(json.name), modulePath + " has an invalid slash command name");
    assert.ok(json.description && json.description.length <= 100, modulePath + " has an invalid description");
  }
});

test("new slash command names are unique", () => {
  const commands = modules.map(modulePath => require(modulePath).data.toJSON());
  const names = commands.map(command => command.name);
  assert.equal(new Set(names).size, names.length, "duplicate slash command names found");
});
