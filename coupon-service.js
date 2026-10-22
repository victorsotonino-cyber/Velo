const { readJSON, writeJSON } = require("./storage");

const FILE = "flux-store-coupons.json";

function readCoupons() {
  const value = readJSON(FILE, []);
  return Array.isArray(value) ? value : [];
}

function writeCoupons(rows) {
  if (!Array.isArray(rows)) throw new TypeError("La lista de cupones debe ser un array.");
  writeJSON(FILE, rows);
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function couponStatus(coupon, now = Date.now()) {
  if (!coupon || typeof coupon !== "object") return "invalid";
  if (coupon.expiresAt) {
    const expires = Date.parse(coupon.expiresAt);
    if (!Number.isFinite(expires) || now >= expires) return "expired";
  }
  const maxUses = Number(coupon.maxUses) || 0;
  const uses = Math.max(0, Number(coupon.uses) || 0);
  if (maxUses > 0 && uses >= maxUses) return "exhausted";
  return "active";
}

function listCouponsForGuild(guildId) {
  return readCoupons().filter(coupon => !coupon.guildId || coupon.guildId === guildId);
}

function findCoupon(guildId, code) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  return listCouponsForGuild(guildId).find(coupon => normalizeCode(coupon.code) === normalized) || null;
}

function hasRedemption(coupon, orderId) {
  return Array.isArray(coupon.redemptions) &&
    coupon.redemptions.some(entry => entry && entry.orderId === String(orderId));
}

function validateCoupon(guildId, code, orderId = null) {
  const coupon = findCoupon(guildId, code);
  if (!coupon) return { ok: false, reason: "Ese cupón no existe." };
  if (orderId && hasRedemption(coupon, orderId)) return { ok: true, coupon, alreadyRedeemed: true };
  const status = couponStatus(coupon);
  if (status !== "active") {
    const reason = status === "expired" ? "El cupón ha caducado." :
      status === "exhausted" ? "El cupón alcanzó su límite de usos." : "El cupón no es válido.";
    return { ok: false, reason, coupon };
  }
  const discount = Number(coupon.discount);
  if (!Number.isFinite(discount) || discount < 1 || discount > 90) {
    return { ok: false, reason: "El descuento guardado en el cupón no es válido.", coupon };
  }
  return { ok: true, coupon, alreadyRedeemed: false };
}

function calculateDiscount(guildId, code, subtotal) {
  const amount = Number(subtotal);
  if (!Number.isFinite(amount) || amount < 0) {
    return { ok: false, reason: "El subtotal no es válido." };
  }
  const validation = validateCoupon(guildId, code);
  if (!validation.ok) return validation;
  const discountAmount = Math.min(amount, Math.round((amount * Number(validation.coupon.discount) / 100 + Number.EPSILON) * 100) / 100);
  return {
    ok: true,
    coupon: validation.coupon,
    discountAmount,
    total: Math.max(0, Math.round((amount - discountAmount + Number.EPSILON) * 100) / 100)
  };
}

function redeemCoupon(guildId, code, orderId, userId) {
  const normalized = normalizeCode(code);
  if (!normalized || !orderId) return { ok: false, reason: "Faltan datos para registrar el uso del cupón." };
  const rows = readCoupons();
  const index = rows.findIndex(coupon =>
    normalizeCode(coupon.code) === normalized &&
    (!coupon.guildId || coupon.guildId === guildId)
  );
  if (index < 0) return { ok: false, reason: "El cupón ya no existe." };
  const coupon = rows[index];
  if (hasRedemption(coupon, orderId)) return { ok: true, coupon, alreadyRedeemed: true };
  const status = couponStatus(coupon);
  if (status !== "active") {
    return { ok: false, reason: status === "expired" ? "El cupón ha caducado." : "El cupón alcanzó su límite de usos." };
  }
  coupon.uses = Math.max(0, Math.floor(Number(coupon.uses) || 0)) + 1;
  coupon.redemptions = Array.isArray(coupon.redemptions) ? coupon.redemptions : [];
  coupon.redemptions.push({
    orderId: String(orderId),
    userId: String(userId || ""),
    guildId: String(guildId || ""),
    redeemedAt: new Date().toISOString()
  });
  coupon.redemptions = coupon.redemptions.slice(-10000);
  rows[index] = coupon;
  writeCoupons(rows);
  return { ok: true, coupon, alreadyRedeemed: false };
}

module.exports = {
  readCoupons,
  writeCoupons,
  normalizeCode,
  couponStatus,
  listCouponsForGuild,
  findCoupon,
  validateCoupon,
  calculateDiscount,
  redeemCoupon
};
