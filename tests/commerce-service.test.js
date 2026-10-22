"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const commerce = require("../commerce-service");

test("parsePrice convierte precios habituales a centavos", function () {
  assert.equal(commerce.parsePrice("$5.99"), 599);
  assert.equal(commerce.parsePrice("7 euros"), 700);
  assert.equal(commerce.parsePrice("1.000,00 EUR"), 100000);
  assert.equal(commerce.parsePrice("1,000.00 USD"), 100000);
});

test("parsePrice no acepta cantidades ambiguas o no positivas", function () {
  assert.throws(function () { commerce.parsePrice("Desde $5 hasta $10"); });
  assert.throws(function () { commerce.parsePrice("gratis"); });
  assert.throws(function () { commerce.parsePrice("0 USD"); });
});

test("normaliza nombres sin distinguir tildes ni mayúsculas", function () {
  assert.equal(commerce.normalize("  Nitro Premium  "), "nitro premium");
  assert.equal(commerce.normalize("Suscripción"), "suscripcion");
});

test("limita las unidades máximas por producto", function () {
  assert.equal(commerce.MAX_QUANTITY, 25);
});
