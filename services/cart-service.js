const { readJSON, writeJSON } = require("../storage");
const store = require("../store-service");
const orderService = require("./order-service");

const FILE = "flux-store-carts.json";
const MAX_DISTINCT_ITEMS = 15;

function readCarts() {
  const rows = readJSON(FILE, []);
  return Array.isArray(rows) ? rows : [];
}

function saveCarts(rows) {
  writeJSON(FILE, rows);
  return rows;
}

function findCart(rows, guildId, userId) {
  return rows.find(cart => cart.guildId === guildId && cart.userId === userId);
}

function getCart(guildId, userId) {
  const rows = readCarts();
  return findCart(rows, guildId, userId) || {
    guildId,
    userId,
    items: [],
    updatedAt: new Date().toISOString()
  };
}

function getProduct(productName) {
  const wanted = String(productName || "").trim().toLowerCase();
  return store.getProducts().find(product =>
    String(product.name || "").trim().toLowerCase() === wanted
  ) || null;
}

function availableStock(product) {
  if (product.stock === undefined || product.stock === null || Number(product.stock) < 0) return Infinity;
  if (!Number.isFinite(Number(product.stock))) return Infinity;
  return Math.max(0, Number(product.stock));
}

function validateProduct(productName, quantity) {
  const product = getProduct(productName);
  if (!product) throw new Error("Ese producto no existe en el catálogo.");
  if (product.enabled === false) throw new Error("Ese producto no está disponible temporalmente.");
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new Error("La cantidad debe estar entre 1 y 99.");
  orderService.parsePrice(product.price);
  const available = availableStock(product);
  if (available === 0) throw new Error("Ese producto está agotado.");
  return { product, quantity: qty, available };
}

function addItem(guildId, userId, productName, quantity) {
  if (!guildId || !userId) throw new Error("El carrito requiere un servidor y un cliente.");
  const checked = validateProduct(productName, quantity);
  const rows = readCarts();
  let cart = findCart(rows, guildId, userId);
  if (!cart) {
    cart = { guildId, userId, items: [], createdAt: new Date().toISOString() };
    rows.push(cart);
  }
  cart.items = Array.isArray(cart.items) ? cart.items : [];
  const existing = cart.items.find(item =>
    String(item.productName || "").toLowerCase() === String(checked.product.name).toLowerCase()
  );
  const newQuantity = (existing ? Number(existing.quantity) || 0 : 0) + checked.quantity;
  if (newQuantity > 99) throw new Error("La cantidad por producto no puede superar 99.");
  if (checked.available !== Infinity && newQuantity > checked.available) {
    throw new Error("Stock insuficiente. Disponible ahora: " + checked.available + " unidades.");
  }
  if (!existing && cart.items.length >= MAX_DISTINCT_ITEMS) {
    throw new Error("El carrito admite hasta " + MAX_DISTINCT_ITEMS + " productos distintos.");
  }
  if (existing) existing.quantity = newQuantity;
  else cart.items.push({ productName: checked.product.name, quantity: checked.quantity });
  cart.updatedAt = new Date().toISOString();
  saveCarts(rows);
  return getCart(guildId, userId);
}

function removeItem(guildId, userId, productName) {
  const rows = readCarts();
  const cart = findCart(rows, guildId, userId);
  if (!cart || !Array.isArray(cart.items)) return { removed: false, cart: getCart(guildId, userId) };
  const index = cart.items.findIndex(item =>
    String(item.productName || "").trim().toLowerCase() === String(productName || "").trim().toLowerCase()
  );
  if (index < 0) return { removed: false, cart };
  cart.items.splice(index, 1);
  cart.updatedAt = new Date().toISOString();
  saveCarts(rows);
  return { removed: true, cart };
}

function clearCart(guildId, userId) {
  const rows = readCarts();
  const cart = findCart(rows, guildId, userId);
  if (!cart) return false;
  cart.items = [];
  cart.updatedAt = new Date().toISOString();
  saveCarts(rows);
  return true;
}

function getCartSummary(guildId, userId) {
  const cart = getCart(guildId, userId);
  const products = store.getProducts();
  const lines = [];
  const subtotalByCurrency = {};
  let totalUnits = 0;

  for (const item of cart.items || []) {
    const product = products.find(p =>
      String(p.name || "").trim().toLowerCase() === String(item.productName || "").trim().toLowerCase()
    );
    if (!product) {
      lines.push({
        productName: item.productName,
        quantity: Number(item.quantity) || 1,
        missing: true,
        message: "Producto eliminado del catálogo"
      });
      continue;
    }
    const qty = Math.max(1, Number(item.quantity) || 1);
    const parsed = orderService.parsePrice(product.price);
    const subtotal = parsed.amountMinor * qty;
    const available = availableStock(product);
    const line = {
      productName: product.name,
      quantity: qty,
      unitPriceMinor: parsed.amountMinor,
      subtotalMinor: subtotal,
      currency: parsed.currency,
      stock: available === Infinity ? "Ilimitado" : String(available),
      available: available === Infinity || available >= qty
    };
    lines.push(line);
    subtotalByCurrency[parsed.currency] = (subtotalByCurrency[parsed.currency] || 0) + subtotal;
    totalUnits += qty;
  }
  return { cart, lines, subtotalByCurrency, totalUnits };
}

function checkout({ guildId, userId, userTag, paymentMethod }) {
  const cart = getCart(guildId, userId);
  if (!cart.items.length) throw new Error("Tu carrito está vacío. Usa /carrito agregar para elegir un producto.");

  const createdOrders = [];
  const failedItems = [];
  const remaining = [];

  for (const item of cart.items) {
    try {
      const order = orderService.createOrder({
        guildId,
        userId,
        userTag,
        productName: item.productName,
        quantity: item.quantity,
        paymentMethod
      });
      createdOrders.push(order);
    } catch (error) {
      remaining.push(item);
      failedItems.push({
        productName: item.productName,
        quantity: item.quantity,
        reason: error.message
      });
    }
  }

  const rows = readCarts();
  const stored = findCart(rows, guildId, userId);
  if (stored) {
    stored.items = remaining;
    stored.updatedAt = new Date().toISOString();
    saveCarts(rows);
  }

  return { createdOrders, failedItems, remaining };
}

module.exports = {
  MAX_DISTINCT_ITEMS,
  getCart,
  getProduct,
  addItem,
  removeItem,
  clearCart,
  getCartSummary,
  checkout
};
