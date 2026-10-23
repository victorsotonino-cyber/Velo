"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const config = require("../config");
const { sendTransactionLog } = require("../utils/transaction-log");

test("transaction logs are delivered to the configured transactions channel without accidental mentions", async () => {
  let delivered = null;
  let fetchedId = null;
  const channel = {
    id: config.channels.transactions,
    isTextBased: () => true,
    send: async payload => { delivered = payload; }
  };
  const guild = {
    channels: {
      fetch: async id => { fetchedId = id; return channel; }
    }
  };

  const ok = await sendTransactionLog(guild, { content: "Nuevo pedido #AB12" }, "test");
  assert.equal(ok, true);
  assert.equal(fetchedId, "1562615500968820802");
  assert.equal(delivered.content, "Nuevo pedido #AB12");
  assert.deepEqual(delivered.allowedMentions, { parse: [] });
});

test("transaction logger safely reports an inaccessible channel without throwing", async () => {
  const guild = { channels: { fetch: async () => { throw new Error("Missing Access"); } } };
  const ok = await sendTransactionLog(guild, { content: "Test" }, "test");
  assert.equal(ok, false);
});
