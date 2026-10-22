const test = require("node:test");
const assert = require("node:assert/strict");

const commands = [
  require("../tienda"),
  require("../pedidos"),
  require("../cupones"),
  require("../help"),
  require("../commands/store/resena"),
  require("../commands/store/sugerencia"),
  require("../commands/store/estadisticas"),
  require("../commands/store/pagos"),
  require("../commands/store/carrito"),
  require("../commands/community/encuesta"),
  require("../commands/general/userinfo")
];

test("all shop and community slash command schemas serialize successfully", () => {
  const names = new Set();
  for (const command of commands) {
    assert.ok(command.data, "Every module needs slash command data.");
    const json = command.data.toJSON();
    assert.match(json.name, /^[a-z0-9_-]{1,32}$/);
    assert.ok(!names.has(json.name), "Duplicate slash command name: " + json.name);
    names.add(json.name);
  }
});

test("/pedido and /tienda expose autocompletion handlers", () => {
  assert.equal(typeof require("../pedidos").autocomplete, "function");
  assert.equal(typeof require("../tienda").autocomplete, "function");
});

const eventInstallers = [
  require("../events/ready"),
  require("../events/interactionCreate"),
  require("../events/messageCreate"),
  require("../events/guildMemberAdd"),
  require("../events/guildMemberRemove")
];

test("event modules export client installers", () => {
  for (const register of eventInstallers) assert.equal(typeof register, "function");
});
