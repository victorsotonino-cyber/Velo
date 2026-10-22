const { randomUUID } = require("crypto");
const { readJSON, writeJSON } = require("../storage");
const storeStats = require("../store-service");

const ORDERS_FILE = "flux-store-orders.json";
const PRODUCTS_FILE = "flux-store-products.json";
const COUPONS_FILE = "flux-store-coupons.json";

const LABELS = {
  pendiente: "🟡 Pendiente",
  pago_verificado: "🔵 Pago verificado",
  procesando: "🟣 En preparación",
  completado: "🟢 Completado",
  cancelado: "🔴 Cancelado"
};

const TRANSITIONS = {
  pendiente: ["pago_verificado", "cancelado"],
  pago_verificado: ["procesando", "cancelado"],
  procesando: ["completado", "cancelado"],
  completado: [],
  cancelado: []
};

function readArray(file) {
  const value = readJSON(file, []);
  return Array.isArray(value) ? value : [];
}

function readOrders() {
  return readArray(ORDERS_FILE);
}

function getOrders(guildId) {
  const rows = readOrders();
  return guildId ? rows.filter(row => row.guildId === guildId) : rows;
}

function getOrderById(guildId, id) {
  const wanted = String(id || "").trim().toUpperCase();
  return getOrders(guildId).find(row => String(row.id || "").toUpperCase() === wanted) || null;
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function safeCurrency(value) {
  const currency = String(value || process.env.STORE_CURRENCY || "USD").toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "USD";
}

function detectCurrency(text) {
  const rules = [
    ["EUR", /€|\bEUR\b|\beuros?\b/i],
    ["GBP", /£|\bGBP\b|\bpounds?\b|\blibras?\b/i],
    ["VES", /\bVES\b|\bBs\.?\b|\bbol[ií]vares?\b/i],
    ["COP", /\bCOP\b|\bpesos?\s+colombianos?\b/i],
    ["MXN", /\bMXN\b|\bpesos?\s+mexicanos?\b/i],
    ["ARS", /\bARS\b|\bpesos?\s+argentinos?\b/i],
    ["CLP", /\bCLP\b|\bpesos?\s+chilenos?\b/i],
    ["USD", /\$|\bUSD\b|\bdollars?\b|\bd[oó]lares?\b/i]
  ];
  for (const [currency, pattern] of rules) {
    if (pattern.test(text)) return currency;
  }
  return safeCurrency();
}

function parsePrice(value) {
  const text = String(value || "").trim();
  const match = text.match(/\d[\d.,]*/);
  if (!match) throw new Error("El precio del producto no contiene una cantidad numérica. Usa un precio como 5 USD, 7,50€ o $10.");
  let number = match[0];

  if (number.includes(",") && number.includes(".")) {
    if (number.lastIndexOf(",") > number.lastIndexOf(".")) {
      number = number.replace(/\./g, "").replace(",", ".");
    } else {
      number = number.replace(/,/g, "");
    }
  } else if (number.includes(",")) {
    const decimals = number.length - number.lastIndexOf(",") - 1;
    number = decimals > 0 && decimals <= 2
      ? number.replace(",", ".")
      : number.replace(/,/g, "");
  } else if (number.includes(".")) {
    const decimals = number.length - number.lastIndexOf(".") - 1;
    if (decimals === 0 || decimals > 2) number = number.replace(/\./g, "");
  }

  const amount = Number(number);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
    throw new Error("El precio debe ser mayor que cero y tener un formato válido.");
  }

  return {
    amountMinor: Math.round(amount * 100),
    currency: detectCurrency(text),
    amount
  };
}

function formatMoney(amountMinor, currency) {
  const code = safeCurrency(currency);
  const amount = Number(amountMinor || 0) / 100;
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 2
    }).format(amount);
  } catch {
    return amount.toFixed(2) + " " + code;
  }
}

function isCouponActive(coupon) {
  const uses = Math.max(0, Number(coupon.uses) || 0);
  const maxUses = Math.max(0, Number(coupon.maxUses) || 0);
  if (coupon.expiresAt) {
    const expiry = Date.parse(coupon.expiresAt);
    if (!Number.isFinite(expiry) || Date.now() >= expiry) return false;
  }
  if (maxUses > 0 && uses >= maxUses) return false;
  return true;
}

function canTransition(current, next) {
  return Boolean(TRANSITIONS[current] && TRANSITIONS[current].includes(next));
}

function productKey(product) {
  return String(product.id || product.name || "").toLowerCase().trim();
}

function createOrder({ guildId, userId, userTag, productName, quantity = 1, paymentMethod, couponCode = "" }) {
  if (!guildId || !userId) throw new Error("El pedido debe estar asociado a un servidor y a un cliente.");
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new Error("La cantidad debe estar entre 1 y 99.");

  const products = readArray(PRODUCTS_FILE);
  const product = products.find(item => String(item.name || "").trim().toLowerCase() === String(productName || "").trim().toLowerCase());
  if (!product) throw new Error("Ese producto no existe en el catálogo. Elige uno de los productos disponibles.");
  if (product.enabled === false) throw new Error("Ese producto no está disponible temporalmente.");

  const hasFiniteStock = product.stock !== undefined && product.stock !== null &&
    Number.isFinite(Number(product.stock)) && Number(product.stock) >= 0;
  if (hasFiniteStock && Number(product.stock) < qty) {
    throw new Error("No hay stock suficiente. Disponible: " + Number(product.stock) + ".");
  }

  const parsed = parsePrice(product.price);
  const subtotalMinor = parsed.amountMinor * qty;
  if (!Number.isSafeInteger(subtotalMinor)) throw new Error("El importe total supera el límite permitido.");

  const orders = readOrders();
  let id;
  do {
    id = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  } while (orders.some(row => String(row.id).toUpperCase() === id));

  let coupons = [];
  let coupon = null;
  let discountPercent = 0;
  const normalizedCoupon = normalizeCode(couponCode);
  if (normalizedCoupon) {
    coupons = readArray(COUPONS_FILE);
    coupon = coupons.find(item =>
      normalizeCode(item.code) === normalizedCoupon &&
      (!item.guildId || item.guildId === guildId)
    );
    if (!coupon) throw new Error("El cupón no existe en este servidor.");
    if (!isCouponActive(coupon)) throw new Error("El cupón ha caducado o alcanzó su límite de usos.");
    discountPercent = Number(coupon.discount);
    if (!Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 90) {
      throw new Error("El cupón tiene un descuento inválido. Contacta con el equipo de FLUX STORE.");
    }
  }

  const discountMinor = Math.min(subtotalMinor, Math.round(subtotalMinor * discountPercent / 100));
  const now = new Date().toISOString();
  const order = {
    id,
    guildId,
    userId,
    userTag: String(userTag || ""),
    product: String(product.name),
    productId: productKey(product),
    quantity: qty,
    price: String(product.price),
    unitPriceMinor: parsed.amountMinor,
    subtotalMinor,
    discountPercent,
    discountMinor,
    totalAmountMinor: subtotalMinor - discountMinor,
    currency: parsed.currency,
    couponCode: normalizedCoupon || null,
    paymentMethod: String(paymentMethod || "Otro").trim().slice(0, 60),
    status: "pendiente",
    stockReserved: hasFiniteStock,
    stockRestored: false,
    saleCounted: false,
    createdAt: now,
    updatedAt: now,
    statusHistory: [{ status: "pendiente", by: userId, at: now }]
  };

  const originalProducts = products.map(item => ({ ...item }));
  const originalCoupons = coupons.map(item => ({ ...item, redemptions: Array.isArray(item.redemptions) ? item.redemptions.map(r => ({ ...r })) : [] }));

  if (hasFiniteStock) {
    product.stock = Number(product.stock) - qty;
    product.updatedAt = now;
  }
  if (coupon) {
    coupon.uses = Math.max(0, Number(coupon.uses) || 0) + 1;
    coupon.redemptions = Array.isArray(coupon.redemptions) ? coupon.redemptions : [];
    coupon.redemptions.push({ orderId: id, userId, guildId, at: now });
  }
  orders.push(order);

  try {
    if (hasFiniteStock) writeJSON(PRODUCTS_FILE, products);
    if (coupon) writeJSON(COUPONS_FILE, coupons);
    writeJSON(ORDERS_FILE, orders.slice(-10000));
  } catch (error) {
    try { if (hasFiniteStock) writeJSON(PRODUCTS_FILE, originalProducts); } catch (_) {}
    try { if (coupon) writeJSON(COUPONS_FILE, originalCoupons); } catch (_) {}
    throw new Error("No se pudo guardar el pedido de forma segura. No se confirmó; inténtalo otra vez.");
  }

  return order;
}

function changeOrderStatus({ guildId, orderId, nextStatus, actorId }) {
  if (!Object.prototype.hasOwnProperty.call(LABELS, nextStatus)) throw new Error("El estado indicado no es válido.");
  const orders = readOrders();
  const order = orders.find(row => row.guildId === guildId && String(row.id).toUpperCase() === String(orderId).trim().toUpperCase());
  if (!order) throw new Error("No encontré ese pedido en este servidor.");
  if (order.status === nextStatus) return { order, changed: false };
  if (!canTransition(order.status, nextStatus)) {
    throw new Error("Transición no permitida: " + (LABELS[order.status] || order.status) + " → " + LABELS[nextStatus] + ".");
  }

  const products = readArray(PRODUCTS_FILE);
  const coupons = readArray(COUPONS_FILE);
  const oldProducts = products.map(item => ({ ...item }));
  const oldCoupons = coupons.map(item => ({ ...item, redemptions: Array.isArray(item.redemptions) ? item.redemptions.map(r => ({ ...r })) : [] }));
  const now = new Date().toISOString();
  const shouldCountSale = nextStatus === "completado" && order.saleCounted !== true;

  if (nextStatus === "cancelado") {
    if (order.stockReserved && !order.stockRestored) {
      const product = products.find(item =>
        productKey(item) === String(order.productId || "").toLowerCase() ||
        String(item.name || "").toLowerCase() === String(order.product || "").toLowerCase()
      );
      if (product && product.stock !== undefined && product.stock !== null &&
          Number.isFinite(Number(product.stock)) && Number(product.stock) >= 0) {
        product.stock = Number(product.stock) + Math.max(1, Number(order.quantity) || 1);
        product.updatedAt = now;
      }
      order.stockRestored = true;
    }

    if (order.couponCode) {
      const coupon = coupons.find(item =>
        normalizeCode(item.code) === normalizeCode(order.couponCode) &&
        (!item.guildId || item.guildId === guildId)
      );
      if (coupon) {
        coupon.uses = Math.max(0, (Number(coupon.uses) || 0) - 1);
        if (Array.isArray(coupon.redemptions)) {
          coupon.redemptions = coupon.redemptions.filter(item => item.orderId !== order.id);
        }
      }
    }
  }

  const previousStatus = order.status;
  order.status = nextStatus;
  order.updatedAt = now;
  order.statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  order.statusHistory.push({ status: nextStatus, by: actorId, at: now });
  if (shouldCountSale) order.saleCounted = true;

  try {
    if (nextStatus === "cancelado" && order.stockReserved) writeJSON(PRODUCTS_FILE, products);
    if (nextStatus === "cancelado" && order.couponCode) writeJSON(COUPONS_FILE, coupons);
    writeJSON(ORDERS_FILE, orders);
  } catch (error) {
    try { if (nextStatus === "cancelado" && order.stockReserved) writeJSON(PRODUCTS_FILE, oldProducts); } catch (_) {}
    try { if (nextStatus === "cancelado" && order.couponCode) writeJSON(COUPONS_FILE, oldCoupons); } catch (_) {}
    throw new Error("No se pudo guardar el cambio de estado. Revisa el almacenamiento y vuelve a intentarlo.");
  }

  if (shouldCountSale) {
    try {
      storeStats.addSales(1);
    } catch (error) {
      console.error("No se pudo actualizar el contador de ventas para el pedido " + order.id, error);
    }
  }

  return { order, previousStatus, changed: true };
}

function hasCompletedOrder(guildId, userId, orderId) {
  const order = getOrderById(guildId, orderId);
  return Boolean(order && order.userId === userId && order.status === "completado");
}

function getStatistics(guildId) {
  const rows = getOrders(guildId);
  const counts = { pendiente: 0, pago_verificado: 0, procesando: 0, completado: 0, cancelado: 0 };
  const revenue = {};
  let completedRevenueOrders = 0;
  for (const order of rows) {
    if (Object.prototype.hasOwnProperty.call(counts, order.status)) counts[order.status] += 1;
    if (order.status === "completado" && Number.isFinite(Number(order.totalAmountMinor))) {
      const currency = safeCurrency(order.currency);
      revenue[currency] = (revenue[currency] || 0) + Number(order.totalAmountMinor);
      completedRevenueOrders += 1;
    }
  }
  return { total: rows.length, counts, revenue, completedRevenueOrders };
}

module.exports = {
  LABELS,
  readOrders,
  getOrders,
  getOrderById,
  createOrder,
  changeOrderStatus,
  hasCompletedOrder,
  getStatistics,
  parsePrice,
  formatMoney,
  canTransition,
  normalizeCode
};
