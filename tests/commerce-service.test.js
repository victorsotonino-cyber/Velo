"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

process.env.VELO_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "flux-store-tests-"));
process.env.STORE_CURRENCY = "USD";

const commerce = require("../commerce-service");
const store = require("../store-service");
const { writeJSON } = require("../storage");

function resetData() {
  store.saveProducts([
    { name: "Nitro Premium", price: "$5.99", description: "Suscripción mensual", stock: 3, enabled: true },
    { name: "Bot personalizado", price: "12.00 USD", description: "Servicio digital", stock: 2, enabled: true }
  ]);
  writeJSON("flux-store-orders.json", []);
  writeJSON("flux-store-carts.json", {});
  writeJSON("flux-store-coupons.json", []);
}

test.beforeEach(resetData);

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

test("checkout usa el precio del catálogo, reserva stock y permite restaurarlo una sola vez", function () {
  const cart = commerce.addToCart("guild-a", "user-a", "nitro premium", 2);
  assert.equal(cart.subtotalCents, 1198);

  const order = commerce.checkout({
    guildId: "guild-a", userId: "user-a", userTag: "Client#0001",
    paymentMethod: "PayPal"
  });

  assert.equal(order.subtotalCents, 1198);
  assert.equal(order.discountCents, 0);
  assert.equal(order.totalCents, 1198);
  assert.equal(store.getProducts()[0].stock, 1);
  assert.equal(commerce.calculateCart("guild-a", "user-a").lines.length, 0);

  assert.equal(commerce.releaseReservedStock(order), true);
  assert.equal(store.getProducts()[0].stock, 3);
  assert.equal(commerce.releaseReservedStock(order), false);
  assert.equal(store.getProducts()[0].stock, 3);
});
test("checkout impide sobreventa de stock entre dos carritos", function () {
  commerce.addToCart("guild-a", "user-a", "Nitro Premium", 2);
  commerce.addToCart("guild-a", "user-b", "Nitro Premium", 2);

  commerce.checkout({
    guildId: "guild-a", userId: "user-a", userTag: "A",
    paymentMethod: "PayPal"
  });

  assert.throws(function () {
    commerce.checkout({
      guildId: "guild-a", userId: "user-b", userTag: "B",
      paymentMethod: "PayPal"
    });
  }, /Stock insuficiente/);
  assert.equal(store.getProducts()[0].stock, 1);
});

test("cupón aplica descuento del catálogo y respeta el máximo de usos", function () {
  const coupon = commerce.createCoupon("guild-a", "FLUX10", 10, 1);
  assert.equal(coupon.code, "FLUX10");
  commerce.addToCart("guild-a", "user-a", "Nitro Premium", 1);
  const order = commerce.checkout({
    guildId: "guild-a", userId: "user-a", userTag: "Client#0001",
    paymentMethod: "PayPal", couponCode: "flux10"
  });
  assert.equal(order.subtotalCents, 599);
  assert.equal(order.discountCents, 60);
  assert.equal(order.totalCents, 539);
  assert.equal(order.couponCode, "FLUX10");
  assert.equal(commerce.listCoupons("guild-a")[0].uses, 1);

  commerce.addToCart("guild-a", "user-b", "Nitro Premium", 1);
  assert.throws(function () {
    commerce.checkout({
      guildId: "guild-a", userId: "user-b", userTag: "Client#0002",
      paymentMethod: "PayPal", couponCode: "FLUX10"
    });
  }, /límite de usos/);
});

test("cupones están aislados por servidor y validan porcentaje", function () {
  commerce.createCoupon("guild-a", "STORE20", 20, null);
  assert.equal(commerce.listCoupons("guild-b").length, 0);
  assert.throws(function () { commerce.createCoupon("guild-a", "BAD", 100, null); }, /entre 1 y 90/);
  assert.equal(commerce.removeCoupon("guild-a", "store20"), true);
  assert.equal(commerce.removeCoupon("guild-a", "store20"), false);
});
