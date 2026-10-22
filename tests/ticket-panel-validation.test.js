"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isHexColor,
  isOptionalHttpsUrl,
  isValidCategoryKey,
  isUnicodeEmoji,
  ticketConfigErrorMessage
} = require("../utils/ticket-panel-validation");

test("hex color validator accepts six-digit colors and rejects malformed input", () => {
  assert.equal(isHexColor("#8B5CF6"), true);
  assert.equal(isHexColor("#ffffff"), true);
  assert.equal(isHexColor("#FFF"), false);
  assert.equal(isHexColor("8B5CF6"), false);
  assert.equal(isHexColor("#GG0000"), false);
  assert.equal(isHexColor(""), false);
});

test("optional image URLs may be empty but only accept HTTPS URLs", () => {
  assert.equal(isOptionalHttpsUrl(""), true);
  assert.equal(isOptionalHttpsUrl("  "), true);
  assert.equal(isOptionalHttpsUrl("https://cdn.example.com/panel.png"), true);
  assert.equal(isOptionalHttpsUrl("http://example.com/panel.png"), false);
  assert.equal(isOptionalHttpsUrl("javascript:alert(1)"), false);
  assert.equal(isOptionalHttpsUrl("not-a-url"), false);
});

test("category IDs follow the internal key constraints", () => {
  assert.equal(isValidCategoryKey("compras"), true);
  assert.equal(isValidCategoryKey("alianza-2"), true);
  assert.equal(isValidCategoryKey("soporte_extra"), true);
  assert.equal(isValidCategoryKey("2compras"), false);
  assert.equal(isValidCategoryKey("Mayusculas"), false);
  assert.equal(isValidCategoryKey("nombre con espacios"), false);
  assert.equal(isValidCategoryKey("a".repeat(33)), false);
});

test("emoji validation supports pictographs and regional-indicator flags", () => {
  assert.equal(isUnicodeEmoji("🛍️"), true);
  assert.equal(isUnicodeEmoji("🇳🇱"), true);
  assert.equal(isUnicodeEmoji("🚀"), true);
  assert.equal(isUnicodeEmoji("no-emoji"), false);
  assert.equal(isUnicodeEmoji("🛍️ text"), false);
  assert.equal(isUnicodeEmoji(""), false);
});

test("configuration errors identify Discord permission failures", () => {
  assert.match(ticketConfigErrorMessage({ code: 50013 }, "create_panel"), /falta de permisos/i);
  assert.match(ticketConfigErrorMessage({ code: 50001 }, "create_panel"), /no tiene acceso/i);
  assert.match(ticketConfigErrorMessage({ code: 50035 }, "save_category"), /formato enviado/i);
});

test("configuration errors explain expired interactions and storage failures", () => {
  assert.match(ticketConfigErrorMessage({ code: 10062 }, "create_panel"), /caducó/i);
  assert.match(ticketConfigErrorMessage({ code: "ENOSPC" }, "save_category"), /almacenamiento/i);
});

test("configuration error fallback is actionable and does not expose stack traces", () => {
  const message = ticketConfigErrorMessage({ code: 12345, message: "secret stack trace" }, "save_category");
  assert.match(message, /guardar la apariencia de la categoría/i);
  assert.doesNotMatch(message, /secret stack trace/i);
});
