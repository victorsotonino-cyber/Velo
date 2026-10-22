const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "flux-store-tests-"));
process.env.VELO_DATA_DIR = dataDir;
process.env.STORE_CURRENCY = "USD";

const { readJSON, writeJSON } = require("../storage");
const orders = require("../services/order-service");
const store = require("../store-service");
const cartService = require("../services/cart-service");

function resetData() {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
}

test.beforeEach(() => resetData());
test.after(() => fs.rmSync(dataDir, { recursive: true, force: true }));

test("cart merges quantities, checks stock and creates orders on checkout", () => {
  writeJSON("flux-store-products.json", [
    { id: "nitro", name: "Nitro", price: "5 USD", stock: 4 },
    { id: "banner", name: "Banner", price: "$10", stock: -1 }
  ]);
  let cart = cartService.addItem("guild-1", "user-1", "Nitro", 2);
  cart = cartService.addItem("guild-1", "user-1", "nitro", 1);
  assert.equal(cart.items.length, 1);
  assert.equal(cart.items[0].quantity, 3);
  assert.throws(() => cartService.addItem("guild-1", "user-1", "Nitro", 2), /Stock insuficiente/);
  cartService.addItem("guild-1", "user-1", "Banner", 1);
  const result = cartService.checkout({
    guildId: "guild-1", userId: "user-1", userTag: "client",
    paymentMethod: "PayPal"
  });
  assert.equal(result.createdOrders.length, 2);
  assert.equal(result.failedItems.length, 0);
  assert.equal(cartService.getCart("guild-1", "user-1").items.length, 0);
  assert.equal(readJSON("flux-store-products.json", [])[0].stock, 1);
});

test("cart keeps products that cannot be checked out", () => {
  writeJSON("flux-store-products.json", [
    { id: "nitro", name: "Nitro", price: "5 USD", stock: 1 }
  ]);
  cartService.addItem("guild-1", "user-1", "Nitro", 1);
  writeJSON("flux-store-products.json", [
    { id: "nitro", name: "Nitro", price: "5 USD", stock: 0 }
  ]);
  const result = cartService.checkout({
    guildId: "guild-1", userId: "user-1", paymentMethod: "PayPal"
  });
  assert.equal(result.createdOrders.length, 0);
  assert.equal(result.failedItems.length, 1);
  assert.equal(cartService.getCart("guild-1", "user-1").items.length, 1);
});


test("parsePrice supports decimal comma, decimal point and currency symbols", () => {
  assert.deepEqual(orders.parsePrice("$5.99"), { amountMinor: 599, currency: "USD", amount: 5.99 });
  assert.equal(orders.parsePrice("7,50 €").amountMinor, 750);
  assert.equal(orders.parsePrice("1.250,00 EUR").amountMinor, 125000);
  assert.equal(orders.parsePrice("1,250.00 USD").amountMinor, 125000);
});

test("parsePrice rejects descriptions without a numeric price", () => {
  assert.throws(() => orders.parsePrice("Consultar por ticket"), /cantidad numérica/);
});

test("creating an order uses the catalog price and reserves finite stock", () => {
  writeJSON("flux-store-products.json", [{ id: "nitro", name: "Nitro", price: "5,00 €", stock: 3 }]);
  const order = orders.createOrder({
    guildId: "guild-1", userId: "user-1", userTag: "cliente",
    productName: "Nitro", quantity: 2, paymentMethod: "PayPal"
  });
  assert.equal(order.totalAmountMinor, 1000);
  assert.equal(order.currency, "EUR");
  assert.equal(readJSON("flux-store-products.json", [])[0].stock, 1);
  assert.equal(orders.getOrderById("guild-1", order.id).userId, "user-1");
});

test("coupon use and stock are returned when a pending order is cancelled", () => {
  writeJSON("flux-store-products.json", [{ id: "nitro", name: "Nitro", price: "5 USD", stock: 2 }]);
  writeJSON("flux-store-coupons.json", [{
    guildId: "guild-1", code: "SAVE10", discount: 10, maxUses: 2, uses: 0, expiresAt: null
  }]);
  const order = orders.createOrder({
    guildId: "guild-1", userId: "user-1", productName: "Nitro",
    quantity: 1, paymentMethod: "PayPal", couponCode: "save10"
  });
  assert.equal(order.totalAmountMinor, 450);
  assert.equal(readJSON("flux-store-coupons.json", [])[0].uses, 1);
  orders.changeOrderStatus({ guildId: "guild-1", orderId: order.id, nextStatus: "cancelado", actorId: "staff-1" });
  assert.equal(readJSON("flux-store-products.json", [])[0].stock, 2);
  assert.equal(readJSON("flux-store-coupons.json", [])[0].uses, 0);
  assert.throws(() => orders.changeOrderStatus({ guildId: "guild-1", orderId: order.id, nextStatus: "pendiente", actorId: "staff-1" }), /Transición no permitida/);
});

test("completed orders count as sales and cannot be downgraded", () => {
  writeJSON("flux-store-products.json", [{ name: "Banner", price: "$10", stock: -1 }]);
  store.setSales(8);
  const order = orders.createOrder({
    guildId: "guild-1", userId: "user-1", productName: "Banner",
    paymentMethod: "Transferencia"
  });
  orders.changeOrderStatus({ guildId: "guild-1", orderId: order.id, nextStatus: "pago_verificado", actorId: "staff-1" });
  orders.changeOrderStatus({ guildId: "guild-1", orderId: order.id, nextStatus: "procesando", actorId: "staff-1" });
  orders.changeOrderStatus({ guildId: "guild-1", orderId: order.id, nextStatus: "completado", actorId: "staff-1" });
  assert.equal(store.getStats().sales, 9);
  assert.throws(() => orders.changeOrderStatus({ guildId: "guild-1", orderId: order.id, nextStatus: "cancelado", actorId: "staff-1" }), /Transición no permitida/);
});
