const { randomUUID } = require("crypto");
const { readJSON, writeJSON } = require("./storage");
const store = require("./store-service");
const coupons = require("./coupon-service");

const ORDERS_FILE = "flux-store-orders.json";
const LABELS = {
  pendiente: "Pendiente",
  pago_verificado: "Pago verificado",
  procesando: "En preparación",
  completado: "Completado",
  cancelado: "Cancelado"
};
const TRANSITIONS = {
  pendiente: new Set(["pago_verificado", "cancelado"]),
  pago_verificado: new Set(["procesando", "cancelado"]),
  procesando: new Set(["completado", "cancelado"]),
  completado: new Set(),
  cancelado: new Set()
};

function readOrders() {
  const rows = readJSON(ORDERS_FILE, []);
  return Array.isArray(rows) ? rows : [];
}

function writeOrders(rows) {
  if (!Array.isArray(rows)) throw new TypeError("La lista de pedidos debe ser un array.");
  writeJSON(ORDERS_FILE, rows.slice(-10000));
}

function createOrder(order) {
  const rows = readOrders();
  const normalized = { ...order };
  if (!normalized.id) normalized.id = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  if (rows.some(row => row.guildId === normalized.guildId && row.id === normalized.id)) {
    normalized.id = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  }
  rows.push(normalized);
  writeOrders(rows);
  return normalized;
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function validateInventory(order, products) {
  const items = Array.isArray(order.items) ? order.items : [];
  for (const item of items) {
    const name = String(item.productName || item.name || "").trim();
    const quantity = Number(item.quantity);
    if (!name || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return { ok: false, reason: "El pedido contiene un artículo con datos inválidos." };
    }
    const product = products.find(p => String(p.name || "").toLowerCase() === name.toLowerCase());
    if (!product) return { ok: false, reason: "El producto \"" + name + "\" ya no está en el catálogo. Revisa el pedido antes de verificar el pago." };
    if (product.enabled === false) return { ok: false, reason: "El producto \"" + name + "\" está pausado. Reactívalo antes de verificar el pago." };
    const stock = Number.isInteger(product.stock) ? product.stock : -1;
    if (stock >= 0 && stock < quantity) {
      return { ok: false, reason: "Stock insuficiente de \"" + name + "\". Disponible: " + stock + ", pedido: " + quantity + "." };
    }
  }
  return { ok: true };
}

function applyInventory(order, products) {
  const adjustments = [];
  for (const item of (Array.isArray(order.items) ? order.items : [])) {
    const name = String(item.productName || item.name || "").trim();
    const product = products.find(p => String(p.name || "").toLowerCase() === name.toLowerCase());
    if (!product) continue;
    const quantity = Number(item.quantity);
    const stock = Number.isInteger(product.stock) ? product.stock : -1;
    if (stock >= 0) {
      product.stock = stock - quantity;
      adjustments.push({ productName: product.name, quantity });
    }
  }
  return adjustments;
}

function restoreInventory(order) {
  if (!order.stockAdjustments || !Array.isArray(order.stockAdjustments) || order.stockAdjustments.length === 0) {
    return { ok: true, restored: 0 };
  }
  const products = store.getProducts();
  let restored = 0;
  for (const adjustment of order.stockAdjustments) {
    const product = products.find(p => String(p.name || "").toLowerCase() === String(adjustment.productName || "").toLowerCase());
    if (!product || !Number.isInteger(product.stock) || product.stock < 0) continue;
    product.stock += Math.max(0, Math.floor(Number(adjustment.quantity) || 0));
    restored++;
  }
  store.saveProducts(products);
  order.stockRestockedAt = new Date().toISOString();
  return { ok: true, restored };
}

function transitionOrder(guildId, orderId, nextStatus, actorId) {
  const rows = readOrders();
  const index = rows.findIndex(row => row.guildId === guildId && String(row.id).toUpperCase() === String(orderId).toUpperCase());
  if (index < 0) return { ok: false, reason: "No encontré ese pedido." };
  const order = rows[index];
  if (!Object.prototype.hasOwnProperty.call(LABELS, nextStatus)) return { ok: false, reason: "Estado no válido." };
  if (order.status === nextStatus) return { ok: true, order, unchanged: true };
  const allowed = TRANSITIONS[order.status] || new Set();
  if (!allowed.has(nextStatus)) {
    return { ok: false, reason: "Transición no permitida: " + (LABELS[order.status] || order.status) + " → " + LABELS[nextStatus] + "." };
  }
  if (nextStatus === "completado" && !["pago_verificado", "procesando"].includes(order.status)) {
    return { ok: false, reason: "Verifica el pago y prepara el pedido antes de completarlo." };
  }

  let productsBefore = null;
  let productsChanged = false;

  if (nextStatus === "pago_verificado" && Array.isArray(order.items) && order.items.length) {
    const products = store.getProducts();
    const inventoryCheck = validateInventory(order, products);
    if (!inventoryCheck.ok) return inventoryCheck;

    if (order.couponCode && !order.couponRedeemedAt) {
      const couponCheck = coupons.validateCoupon(guildId, order.couponCode, order.id);
      if (!couponCheck.ok) return { ok: false, reason: "No se puede verificar el pago: " + couponCheck.reason };
    }

    productsBefore = JSON.parse(JSON.stringify(products));
    const adjustments = applyInventory(order, products);
    try {
      if (adjustments.length) {
        store.saveProducts(products);
        productsChanged = true;
      }
      if (order.couponCode && !order.couponRedeemedAt) {
        const redemption = coupons.redeemCoupon(guildId, order.couponCode, order.id, order.userId);
        if (!redemption.ok) {
          if (productsChanged && productsBefore) store.saveProducts(productsBefore);
          return { ok: false, reason: "No se pudo registrar el cupón: " + redemption.reason };
        }
        order.couponRedeemedAt = new Date().toISOString();
      }
      if (adjustments.length) {
        order.stockAdjustments = adjustments;
        order.stockDeductedAt = new Date().toISOString();
      }
      order.inventoryCheckedAt = new Date().toISOString();
    } catch (error) {
      if (productsChanged && productsBefore) {
        try { store.saveProducts(productsBefore); } catch (rollbackError) {
          console.error("Error restaurando inventario tras fallo de pedido:", rollbackError);
        }
      }
      return { ok: false, reason: "No se pudo guardar el inventario de forma segura. No cambies el estado manualmente; revisa los logs." };
    }
  }

  if (nextStatus === "cancelado" && order.stockDeductedAt && !order.stockRestockedAt) {
    try {
      restoreInventory(order);
    } catch (error) {
      return { ok: false, reason: "No pude devolver el stock automáticamente. Revisa el inventario antes de cancelar este pedido." };
    }
  }

  const now = new Date().toISOString();
  order.status = nextStatus;
  order.updatedAt = now;
  order.statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  order.statusHistory.push({ status: nextStatus, by: actorId, at: now });
  rows[index] = order;
  writeOrders(rows);
  return { ok: true, order, unchanged: false };
}

module.exports = { ORDERS_FILE, LABELS, readOrders, writeOrders, createOrder, transitionOrder };
