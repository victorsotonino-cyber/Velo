const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { randomUUID } = require("crypto");
const config = require("./config");
const store = require("./store-service");
const couponService = require("./coupon-service");
const orderService = require("./order-service");
const { readJSON, writeJSON } = require("./storage");

const CARTS_FILE = "flux-store-carts.json";
const CURRENCY = String(process.env.STORE_CURRENCY || "USD").trim().slice(0, 10);

function readCarts() {
  const data = readJSON(CARTS_FILE, {});
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}

function saveCarts(data) {
  writeJSON(CARTS_FILE, data);
}

function cartKey(guildId, userId) {
  return String(guildId) + ":" + String(userId);
}

function findProduct(products, name) {
  const key = String(name || "").trim().toLowerCase();
  return products.find(p => String(p.name || "").trim().toLowerCase() === key) || null;
}

function productPrice(product) {
  const explicit = Number(product.priceAmount);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round((explicit + Number.EPSILON) * 100) / 100;

  const label = String(product.price || "").trim();
  if (!label || /desde|a partir|negociable|entre|gratis|consultar|variable/i.test(label)) return null;
  if (/[–—]/.test(label) || /\d\s*-\s*\d/.test(label)) return null;
  const matches = label.match(/\d+(?:[.,]\d{1,2})?/g) || [];
  if (matches.length !== 1) return null;
  const value = Number(matches[0].replace(",", "."));
  return Number.isFinite(value) && value > 0 ? Math.round((value + Number.EPSILON) * 100) / 100 : null;
}

function productStock(product) {
  return Number.isInteger(product.stock) ? product.stock : -1;
}

function money(amount) {
  return Number(amount).toFixed(2) + " " + CURRENCY;
}

function getCartItems(carts, key) {
  return Array.isArray(carts[key]) ? carts[key] : [];
}

function currentCart(products, rows) {
  let subtotal = 0;
  const lines = [];
  const issues = [];
  for (const row of rows) {
    const product = findProduct(products, row.productName);
    const quantity = Number(row.quantity);
    if (!product || product.enabled === false) {
      issues.push("• " + String(row.productName).slice(0, 80) + ": ya no está disponible.");
      lines.push({ row, product: null, unitPrice: 0, lineTotal: 0 });
      continue;
    }
    const price = productPrice(product);
    if (price === null) {
      issues.push("• " + product.name + ": define un importe numérico con /tienda editar antes de comprar.");
      lines.push({ row, product, unitPrice: 0, lineTotal: 0 });
      continue;
    }
    const stock = productStock(product);
    if (stock === 0 || (stock > 0 && quantity > stock)) {
      issues.push("• " + product.name + ": stock insuficiente (disponible: " + Math.max(0, stock) + ").");
    }
    const lineTotal = Math.round((price * quantity + Number.EPSILON) * 100) / 100;
    subtotal += lineTotal;
    lines.push({ row, product, unitPrice: price, lineTotal });
  }
  return { lines, subtotal: Math.round((subtotal + Number.EPSILON) * 100) / 100, issues };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("carrito")
    .setDescription("Gestiona tu carrito de compra de FLUX STORE.")
    .addSubcommand(s => s.setName("agregar").setDescription("Añade un producto del catálogo al carrito.")
      .addStringOption(o => o.setName("producto").setDescription("Nombre exacto del producto en el catálogo").setMinLength(2).setMaxLength(80).setRequired(true))
      .addIntegerOption(o => o.setName("cantidad").setDescription("Cantidad de unidades").setMinValue(1).setMaxValue(99).setRequired(false)))
    .addSubcommand(s => s.setName("ver").setDescription("Muestra los productos de tu carrito y el subtotal."))
    .addSubcommand(s => s.setName("quitar").setDescription("Elimina un producto del carrito.")
      .addStringOption(o => o.setName("producto").setDescription("Nombre exacto del producto que quieres quitar").setMinLength(2).setMaxLength(80).setRequired(true)))
    .addSubcommand(s => s.setName("vaciar").setDescription("Vacía por completo tu carrito."))
    .addSubcommand(s => s.setName("comprar").setDescription("Crea un pedido pendiente con el contenido del carrito.")
      .addStringOption(o => o.setName("metodo").setDescription("Método de pago que vas a utilizar").setMinLength(2).setMaxLength(60).setRequired(true))
      .addStringOption(o => o.setName("cupon").setDescription("Cupón de descuento opcional").setMinLength(3).setMaxLength(24).setRequired(false))
      .addStringOption(o => o.setName("detalles").setDescription("Información útil para preparar el pedido").setMaxLength(400).setRequired(false))),
  async execute(i) {
    if (!i.guildId) return i.reply({ content: "Este comando solo funciona dentro de un servidor.", ephemeral: true });
    const action = i.options.getSubcommand();
    const carts = readCarts();
    const key = cartKey(i.guildId, i.user.id);
    const rows = getCartItems(carts, key);
    const products = store.getProducts();

    if (action === "agregar") {
      const requestedName = i.options.getString("producto").trim();
      const quantity = i.options.getInteger("cantidad") || 1;
      const product = findProduct(products, requestedName);
      if (!product) return i.reply({ content: "No encuentro ese producto. Usa /tienda catalogo y copia el nombre exacto.", ephemeral: true });
      if (product.enabled === false) return i.reply({ content: "Ese producto está pausado por el equipo de la tienda.", ephemeral: true });
      const price = productPrice(product);
      if (price === null) {
        return i.reply({ content: "No puedo calcular un importe seguro para ese producto. El equipo debe establecer el campo importe con /tienda editar.", ephemeral: true });
      }
      const stock = productStock(product);
      if (stock === 0 || (stock > 0 && quantity > stock)) {
        return i.reply({ content: "Stock insuficiente. Disponible ahora: " + Math.max(0, stock) + ".", ephemeral: true });
      }
      const existing = rows.find(row => String(row.productName).toLowerCase() === product.name.toLowerCase());
      if (existing) {
        const nextQuantity = Number(existing.quantity) + quantity;
        if (nextQuantity > 99) return i.reply({ content: "El carrito admite hasta 99 unidades por producto.", ephemeral: true });
        if (stock >= 0 && nextQuantity > stock) return i.reply({ content: "No hay stock suficiente para esa cantidad. Disponible ahora: " + stock + ".", ephemeral: true });
        existing.quantity = nextQuantity;
        existing.updatedAt = new Date().toISOString();
      } else {
        if (rows.length >= 25) return i.reply({ content: "Tu carrito ya tiene 25 productos diferentes. Quita uno antes de añadir otro.", ephemeral: true });
        rows.push({ productName: product.name, quantity, addedAt: new Date().toISOString() });
      }
      carts[key] = rows;
      saveCarts(carts);
      return i.reply({
        content: "🛒 Añadido **" + product.name + "** × **" + quantity + "**. Precio actual: **" + money(price) + "** por unidad. Usa /carrito ver para revisar el pedido.",
        ephemeral: true,
        allowedMentions: { parse: [] }
      });
    }

    if (action === "ver") {
      if (!rows.length) return i.reply({ content: "Tu carrito está vacío. Usa /carrito agregar para añadir productos.", ephemeral: true });
      const summary = currentCart(products, rows);
      const description = summary.lines.map(line => {
        const name = line.product ? line.product.name : line.row.productName;
        if (!line.product || !line.unitPrice) return "• **" + name + "** × " + line.row.quantity + " — no disponible para compra";
        return "• **" + name + "** × " + line.row.quantity + " — " + money(line.lineTotal) + " (" + money(line.unitPrice) + " c/u)";
      }).join("\n");
      const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle("🛒 Tu carrito · FLUX STORE")
        .setDescription((description + (summary.issues.length ? "\n\n**Revisar antes de comprar**\n" + summary.issues.join("\n") : "")).slice(0, 4000))
        .addFields({ name: "Subtotal", value: money(summary.subtotal), inline: true })
        .setFooter({ text: "El stock y el cupón se vuelven a validar al confirmar el pago." });
      return i.reply({ embeds: [embed], ephemeral: true, allowedMentions: { parse: [] } });
    }

    if (action === "quitar") {
      const name = i.options.getString("producto").trim().toLowerCase();
      const index = rows.findIndex(row => String(row.productName).toLowerCase() === name);
      if (index < 0) return i.reply({ content: "Ese producto no está en tu carrito.", ephemeral: true });
      const removed = rows.splice(index, 1)[0];
      if (rows.length) carts[key] = rows;
      else delete carts[key];
      saveCarts(carts);
      return i.reply({ content: "✅ Quité **" + removed.productName + "** de tu carrito.", ephemeral: true, allowedMentions: { parse: [] } });
    }

    if (action === "vaciar") {
      if (!rows.length) return i.reply({ content: "Tu carrito ya está vacío.", ephemeral: true });
      delete carts[key];
      saveCarts(carts);
      return i.reply({ content: "✅ Carrito vaciado.", ephemeral: true });
    }

    if (!rows.length) return i.reply({ content: "Tu carrito está vacío. Añade productos antes de comprar.", ephemeral: true });
    const summary = currentCart(products, rows);
    if (summary.issues.length) {
      return i.reply({
        content: "❌ No puedo crear el pedido porque hay problemas con el carrito:\n" + summary.issues.join("\n") + "\n\nActualiza el catálogo o las cantidades y vuelve a intentarlo.",
        ephemeral: true,
        allowedMentions: { parse: [] }
      });
    }

    const couponCode = i.options.getString("cupon")?.trim() || "";
    let discountAmount = 0;
    let discountPercent = 0;
    let totalAmount = summary.subtotal;
    if (couponCode) {
      const discount = couponService.calculateDiscount(i.guildId, couponCode, summary.subtotal);
      if (!discount.ok) return i.reply({ content: "❌ No puedo aplicar ese cupón: " + discount.reason, ephemeral: true });
      discountAmount = discount.discountAmount;
      totalAmount = discount.total;
      discountPercent = Number(discount.coupon.discount);
    }

    const method = i.options.getString("metodo").trim();
    const details = i.options.getString("detalles")?.trim() || "";
    const now = new Date().toISOString();
    const orderItems = summary.lines.map(line => ({
      productName: line.product.name,
      quantity: Number(line.row.quantity),
      unitPrice: line.unitPrice,
      subtotal: line.lineTotal,
      category: String(line.product.category || "General").slice(0, 40)
    }));
    const order = orderService.createOrder({
      id: randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase(),
      source: "carrito",
      guildId: i.guildId,
      userId: i.user.id,
      userTag: i.user.tag,
      product: orderItems.map(item => item.quantity + "× " + item.productName).join(", ").slice(0, 500),
      items: orderItems,
      subtotalAmount: summary.subtotal,
      couponCode: couponCode ? couponService.normalizeCode(couponCode) : null,
      couponDiscountPercent: discountPercent,
      couponDiscountAmount: discountAmount,
      totalAmount,
      currency: CURRENCY,
      price: money(totalAmount),
      paymentMethod: method,
      details,
      status: "pendiente",
      createdAt: now,
      updatedAt: now,
      statusHistory: [{ status: "pendiente", by: i.user.id, at: now }]
    });

    delete carts[key];
    saveCarts(carts);

    const lines = orderItems.map(item => "• " + item.quantity + "× **" + item.productName + "** — " + money(item.subtotal)).join("\n");
    const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle("🧾 Pedido creado · #" + order.id)
      .setDescription(lines.slice(0, 2500))
      .addFields(
        { name: "Subtotal", value: money(summary.subtotal), inline: true },
        { name: "Descuento", value: money(discountAmount) + (couponCode ? " (" + discountPercent + "% · " + couponCode + ")" : ""), inline: true },
        { name: "Total", value: money(totalAmount), inline: true },
        { name: "Método elegido", value: method.slice(0, 100), inline: true },
        { name: "Estado", value: "🟡 Pendiente de verificación", inline: true }
      )
      .setFooter({ text: "FLUX STORE • No marques como pagado hasta verificar el pago." })
      .setTimestamp();
    await i.reply({ embeds: [embed], ephemeral: true, allowedMentions: { parse: [] } });

    const log = i.guild.channels.cache.get(config.channels.logs);
    if (log?.isTextBased()) {
      const logEmbed = new EmbedBuilder().setColor(config.colors.warning).setTitle("🛒 Nuevo pedido · #" + order.id)
        .setDescription("**Cliente:** " + i.user.tag + " (" + i.user.id + ")\n**Productos:**\n" + lines.slice(0, 1800))
        .addFields(
          { name: "Total", value: money(totalAmount), inline: true },
          { name: "Método", value: method.slice(0, 100), inline: true },
          { name: "Estado", value: "Pendiente", inline: true }
        ).setTimestamp();
      await log.send({ embeds: [logEmbed], allowedMentions: { parse: [] } }).catch(error => {
        console.error("No se pudo enviar el log del pedido #" + order.id + ":", error.message);
      });
    }
  }
};
