"use strict";

const { randomUUID } = require("crypto");
const config = require("./config");
const store = require("./store-service");
const { readJSON, writeJSON } = require("./storage");

const CARTS_FILE = "flux-store-carts.json";
const ORDERS_FILE = "flux-store-orders.json";
const COUPONS_FILE = "flux-store-coupons.json";
const CURRENCY = String(process.env.STORE_CURRENCY || "USD").toUpperCase();
const MAX_QUANTITY = 25;

function normalize(value) {
  return String(value || "").trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function cartKey(guildId, userId) {
  return String(guildId) + ":" + String(userId);
}

function getCarts() {
  const value = readJSON(CARTS_FILE, {});
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function getOrders() {
  const value = readJSON(ORDERS_FILE, []);
  return Array.isArray(value) ? value : [];
}

function getCoupons() {
  const value = readJSON(COUPONS_FILE, []);
  return Array.isArray(value) ? value : [];
}

function parsePrice(raw) {
  const matches = String(raw == null ? "" : raw).match(/\d[\d.,]*/g) || [];
  if (matches.length !== 1) {
    throw new Error("El precio del producto debe contener una sola cantidad numérica. Edita el precio del catálogo, por ejemplo: 5.99 USD.");
  }

  let value = matches[0];
  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastDot > lastComma) {
      value = value.replace(/,/g, "");
    } else {
      value = value.replace(/\./g, "").replace(",", ".");
    }
  } else if (lastComma >= 0) {
    const decimals = value.length - lastComma - 1;
    value = decimals === 1 || decimals === 2
      ? value.replace(/\./g, "").replace(",", ".")
      : value.replace(/,/g, "");
  } else if ((value.match(/\./g) || []).length > 1) {
    const parts = value.split(".");
    const last = parts.pop();
    value = parts.join("") + (last.length <= 2 ? "." + last : last);
  }

  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) {
    throw new Error("El precio del producto no es válido o supera el límite permitido.");
  }
  return Math.round(amount * 100);
}

function money(cents, currency) {
  const code = String(currency || CURRENCY).toUpperCase();
  const amount = (Number(cents) || 0) / 100;
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency", currency: code, maximumFractionDigits: 2
    }).format(amount);
  } catch (_) {
    return code + " " + amount.toFixed(2);
  }
}

function findProduct(products, name) {
  const wanted = normalize(name);
  return products.find(function (product) {
    return normalize(product.name) === wanted;
  }) || null;
}

function isStockTracked(product) {
  return Object.prototype.hasOwnProperty.call(product, "stock") &&
    Number.isInteger(Number(product.stock)) && Number(product.stock) >= 0;
}

function validateProduct(product) {
  if (!product) throw new Error("No encontré ese producto en el catálogo. Revisa el nombre con /tienda catalogo.");
  if (product.enabled === false || product.active === false) {
    throw new Error("Ese producto está desactivado temporalmente.");
  }
  return parsePrice(product.price);
}

function getCart(guildId, userId) {
  const carts = getCarts();
  const cart = carts[cartKey(guildId, userId)];
  return cart && Array.isArray(cart.items) ? cart : {
    guildId: String(guildId), userId: String(userId), items: []
  };
}

function calculateCart(guildId, userId) {
  const cart = getCart(guildId, userId);
  const products = store.getProducts();
  const lines = [];
  let subtotalCents = 0;

  for (const item of cart.items) {
    const product = findProduct(products, item.productName);
    const unitCents = validateProduct(product);
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw new Error("El carrito contiene una cantidad inválida. Quita ese artículo y vuelve a añadirlo.");
    }
    if (isStockTracked(product) && Number(product.stock) < quantity) {
      throw new Error("Stock insuficiente para **" + product.name + "**. Disponible: " + product.stock + ".");
    }
    const lineCents = unitCents * quantity;
    subtotalCents += lineCents;
    lines.push({
      productName: product.name,
      quantity: quantity,
      unitCents: unitCents,
      lineCents: lineCents,
      stock: isStockTracked(product) ? Number(product.stock) : null
    });
  }

  return { cart: cart, lines: lines, subtotalCents: subtotalCents, currency: CURRENCY };
}

function addToCart(guildId, userId, productName, quantity) {
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QUANTITY) {
    throw new Error("La cantidad debe estar entre 1 y " + MAX_QUANTITY + ".");
  }

  const products = store.getProducts();
  const product = findProduct(products, productName);
  validateProduct(product);

  if (isStockTracked(product) && Number(product.stock) <= 0) {
    throw new Error("Ese producto está agotado.");
  }

  const carts = getCarts();
  const key = cartKey(guildId, userId);
  const cart = carts[key] && Array.isArray(carts[key].items)
    ? carts[key]
    : { guildId: String(guildId), userId: String(userId), items: [] };

  const existing = cart.items.find(function (item) {
    return normalize(item.productName) === normalize(product.name);
  });
  const nextQuantity = (existing ? Number(existing.quantity) : 0) + qty;

  if (nextQuantity > MAX_QUANTITY) throw new Error("No puedes tener más de " + MAX_QUANTITY + " unidades del mismo producto en el carrito.");
  if (isStockTracked(product) && nextQuantity > Number(product.stock)) {
    throw new Error("Solo hay " + product.stock + " unidades disponibles.");
  }

  if (existing) existing.quantity = nextQuantity;
  else cart.items.push({ productName: product.name, quantity: qty, addedAt: new Date().toISOString() });

  cart.updatedAt = new Date().toISOString();
  carts[key] = cart;
  writeJSON(CARTS_FILE, carts);
  return calculateCart(guildId, userId);
}

function removeFromCart(guildId, userId, productName) {
  const carts = getCarts();
  const key = cartKey(guildId, userId);
  const cart = carts[key];
  if (!cart || !Array.isArray(cart.items) || !cart.items.length) {
    throw new Error("Tu carrito está vacío.");
  }

  const index = cart.items.findIndex(function (item) {
    return normalize(item.productName) === normalize(productName);
  });
  if (index < 0) throw new Error("Ese producto no está en tu carrito.");

  cart.items.splice(index, 1);
  cart.updatedAt = new Date().toISOString();
  if (!cart.items.length) delete carts[key];
  else carts[key] = cart;
  writeJSON(CARTS_FILE, carts);
  return cart.items.length;
}

function clearCart(guildId, userId) {
  const carts = getCarts();
  delete carts[cartKey(guildId, userId)];
  writeJSON(CARTS_FILE, carts);
}

function findValidCoupon(code, guildId, userId, coupons) {
  if (!code) return null;
  const normalizedCode = String(code).trim().toUpperCase();
  const coupon = coupons.find(function (item) {
    return String(item.code || "").trim().toUpperCase() === normalizedCode;
  });
  if (!coupon) throw new Error("El cupón **" + normalizedCode + "** no existe.");

  if (coupon.expiresAt) {
    const expires = Date.parse(coupon.expiresAt);
    if (!Number.isFinite(expires) || Date.now() >= expires) throw new Error("Ese cupón ha caducado.");
  }

  const maxUses = Number(coupon.maxUses) || 0;
  const uses = Math.max(0, Number(coupon.uses) || 0);
  if (maxUses > 0 && uses >= maxUses) throw new Error("Ese cupón alcanzó el límite de usos.");

  const redemptions = Array.isArray(coupon.redemptions) ? coupon.redemptions : [];
  const buyerKey = String(guildId) + ":" + String(userId);
  if (redemptions.some(function (entry) {
    return typeof entry === "string" ? entry === buyerKey :
      entry && entry.guildId === String(guildId) && entry.userId === String(userId);
  })) {
    throw new Error("Ya utilizaste ese cupón anteriormente.");
  }

  const discount = Number(coupon.discount);
  if (!Number.isFinite(discount) || discount < 1 || discount > 90) {
    throw new Error("Ese cupón tiene un descuento mal configurado; avisa al equipo.");
  }
  return coupon;
}

function createOrderFromItems(args) {
  const guildId = String(args.guildId || "");
  const userId = String(args.userId || "");
  if (!guildId || !userId) throw new Error("El pedido debe crearse desde un servidor de Discord.");

  const products = store.getProducts();
  const sourceLines = Array.isArray(args.items) ? args.items : [];
  if (!sourceLines.length) throw new Error("Tu carrito está vacío.");

  let subtotalCents = 0;
  const orderItems = [];
  for (const line of sourceLines) {
    const product = findProduct(products, line.productName);
    const unitCents = validateProduct(product);
    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw new Error("Cantidad no válida para " + (product && product.name ? product.name : "un producto") + ".");
    }
    if (isStockTracked(product) && Number(product.stock) < quantity) {
      throw new Error("Stock insuficiente para **" + product.name + "**. Disponible: " + product.stock + ".");
    }
    const lineCents = unitCents * quantity;
    subtotalCents += lineCents;
    orderItems.push({
      productName: product.name,
      quantity: quantity,
      unitCents: unitCents,
      lineCents: lineCents,
      stockTracked: isStockTracked(product)
    });
  }

  const coupons = getCoupons();
  const coupon = findValidCoupon(args.couponCode, guildId, userId, coupons);
  const discountCents = coupon ? Math.floor(subtotalCents * Number(coupon.discount) / 100) : 0;
  const totalCents = Math.max(0, subtotalCents - discountCents);
  const orders = getOrders();

  let id;
  do {
    id = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  } while (orders.some(function (order) { return order.id === id; }));

  const now = new Date().toISOString();
  const productSummary = orderItems.map(function (item) {
    return item.productName + " x" + item.quantity;
  }).join(", ").slice(0, 900);
  const order = {
    id: id,
    guildId: guildId,
    userId: userId,
    userTag: String(args.userTag || userId).slice(0, 100),
    product: productSummary,
    items: orderItems,
    currency: CURRENCY,
    subtotalCents: subtotalCents,
    discountCents: discountCents,
    totalCents: totalCents,
    price: money(totalCents, CURRENCY),
    couponCode: coupon ? coupon.code : null,
    paymentMethod: String(args.paymentMethod || "Sin indicar").slice(0, 60),
    details: String(args.details || "").slice(0, 700),
    status: "pendiente",
    createdAt: now,
    updatedAt: now,
    statusHistory: [{ status: "pendiente", by: userId, at: now }]
  };

  // Re-resolve each product and reserve tracked stock before clearing the cart.
  for (const item of orderItems) {
    if (!item.stockTracked) continue;
    const product = findProduct(products, item.productName);
    product.stock = Number(product.stock) - item.quantity;
  }

  orders.push(order);
  writeJSON(ORDERS_FILE, orders.slice(-10000));
  if (orderItems.some(function (item) { return item.stockTracked; })) store.saveProducts(products);

  if (coupon) {
    coupon.uses = (Number(coupon.uses) || 0) + 1;
    coupon.redemptions = Array.isArray(coupon.redemptions) ? coupon.redemptions : [];
    coupon.redemptions.push({ guildId: guildId, userId: userId, orderId: id, at: now });
    writeJSON(COUPONS_FILE, coupons);
  }

  return order;
}

function checkout(args) {
  const view = calculateCart(args.guildId, args.userId);
  if (!view.lines.length) throw new Error("Tu carrito está vacío. Usa /carrito agregar primero.");
  const order = createOrderFromItems({
    guildId: args.guildId,
    userId: args.userId,
    userTag: args.userTag,
    items: view.lines,
    paymentMethod: args.paymentMethod,
    couponCode: args.couponCode,
    details: args.details
  });
  clearCart(args.guildId, args.userId);
  return order;
}

function releaseReservedStock(order) {
  if (!order || !Array.isArray(order.items) || order.stockReleasedAt) return false;
  const products = store.getProducts();
  let changed = false;

  for (const item of order.items) {
    if (!item.stockTracked) continue;
    const product = findProduct(products, item.productName);
    if (!product || !isStockTracked(product)) continue;
    product.stock = Number(product.stock) + Number(item.quantity || 0);
    changed = true;
  }

  if (changed) store.saveProducts(products);
  order.stockReleasedAt = new Date().toISOString();
  return true;
}

function getOrderStats(guildId) {
  const rows = getOrders().filter(function (order) {
    return order.guildId === String(guildId);
  });
  const done = rows.filter(function (order) { return order.status === "completado"; });
  const pending = rows.filter(function (order) { return ["pendiente", "pago_verificado", "procesando"].includes(order.status); });
  const cancelled = rows.filter(function (order) { return order.status === "cancelado"; });
  const totalCents = done.reduce(function (sum, order) {
    const cents = Number.isFinite(Number(order.totalCents))
      ? Number(order.totalCents)
      : (Number.isFinite(Number(order.subtotalCents)) ? Number(order.subtotalCents) - (Number(order.discountCents) || 0) : 0);
    return sum + Math.max(0, cents);
  }, 0);

  return {
    total: rows.length, completed: done.length, pending: pending.length,
    cancelled: cancelled.length, revenueCents: totalCents, currency: CURRENCY,
    products: store.getProducts().length
  };
}

module.exports = {
  CURRENCY, MAX_QUANTITY, normalize, money, parsePrice, getCart, calculateCart,
  addToCart, removeFromCart, clearCart, checkout, createOrderFromItems,
  releaseReservedStock, getOrderStats, getOrders
};
