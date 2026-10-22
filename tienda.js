const { randomUUID } = require("crypto");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
const store = require("./store-service");

const CURRENCY = String(process.env.STORE_CURRENCY || "USD").trim().slice(0, 10);

function money(amount) {
  return Number(amount).toFixed(2) + " " + CURRENCY;
}

function stockLabel(product) {
  if (product.enabled === false) return "⛔ Pausado";
  const stock = Number.isInteger(product.stock) ? product.stock : -1;
  if (stock === 0) return "🔴 Agotado";
  return stock < 0 ? "🟢 Disponible" : "📦 Stock: " + stock;
}

function safeText(value, max) {
  return String(value || "").trim().slice(0, max);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tienda")
    .setDescription("Catálogo y administración de productos de FLUX STORE.")
    .addSubcommand(s => s.setName("catalogo").setDescription("Muestra productos, precio y disponibilidad."))
    .addSubcommand(s => s.setName("agregar").setDescription("Añade un producto al catálogo.")
      .addStringOption(o => o.setName("nombre").setDescription("Nombre del producto").setMinLength(2).setMaxLength(80).setRequired(true))
      .addStringOption(o => o.setName("precio").setDescription("Precio mostrado, por ejemplo 7 EUR o $5").setMaxLength(40).setRequired(true))
      .addStringOption(o => o.setName("descripcion").setDescription("Detalles del producto").setMaxLength(500).setRequired(false))
      .addNumberOption(o => o.setName("importe").setDescription("Precio numérico exacto para el carrito (moneda configurada)").setMinValue(0.01).setMaxValue(1000000).setRequired(false))
      .addIntegerOption(o => o.setName("stock").setDescription("Unidades en stock; 0 agotado; omitir = ilimitado").setMinValue(0).setMaxValue(1000000).setRequired(false))
      .addStringOption(o => o.setName("categoria").setDescription("Categoría del producto").setMaxLength(40).setRequired(false)))
    .addSubcommand(s => s.setName("editar").setDescription("Edita precio, stock, categoría o disponibilidad.")
      .addStringOption(o => o.setName("nombre").setDescription("Nombre exacto actual del producto").setMinLength(2).setMaxLength(80).setRequired(true))
      .addStringOption(o => o.setName("precio").setDescription("Nuevo texto del precio (opcional)").setMaxLength(40).setRequired(false))
      .addStringOption(o => o.setName("descripcion").setDescription("Nueva descripción (opcional)").setMaxLength(500).setRequired(false))
      .addNumberOption(o => o.setName("importe").setDescription("Precio numérico exacto para el carrito").setMinValue(0.01).setMaxValue(1000000).setRequired(false))
      .addIntegerOption(o => o.setName("stock").setDescription("Nuevo stock disponible (0 = agotado)").setMinValue(0).setMaxValue(1000000).setRequired(false))
      .addStringOption(o => o.setName("categoria").setDescription("Nueva categoría").setMaxLength(40).setRequired(false))
      .addBooleanOption(o => o.setName("habilitado").setDescription("Permite o pausa nuevas compras").setRequired(false)))
    .addSubcommand(s => s.setName("eliminar").setDescription("Elimina un producto del catálogo.")
      .addStringOption(o => o.setName("nombre").setDescription("Nombre exacto del producto").setMinLength(2).setMaxLength(80).setRequired(true))),
  async execute(i) {
    const action = i.options.getSubcommand();
    const products = store.getProducts();

    if (action === "catalogo") {
      const lines = products.slice(0, 25).map(product => {
        const name = safeText(product.name, 80) || "Producto sin nombre";
        const displayPrice = product.priceAmount !== undefined && product.priceAmount !== null && Number.isFinite(Number(product.priceAmount))
          ? safeText(product.price, 40) || money(product.priceAmount)
          : safeText(product.price, 40) || "Precio por consultar";
        const category = safeText(product.category, 40) || "General";
        return "✦ **" + name + "** — **" + displayPrice + "**\n" +
          "Categoría: " + category + " · " + stockLabel(product) + "\n" +
          safeText(product.description, 180).replace(/@everyone|@here/g, value => "@" + "\u200b" + value.slice(1));
      });
      const description = lines.join("\n\n").slice(0, 4000);
      const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle("🛍️ Catálogo de FLUX STORE")
        .setDescription(description || "El catálogo está vacío. El equipo puede añadir productos con /tienda agregar.")
        .setFooter({ text: "Precios mostrados en el catálogo; el importe numérico se usa para calcular pedidos." });
      return i.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    }

    if (!store.isStoreStaff(i.member)) return i.reply({ content: "❌ Necesitas permiso de tienda o administración para modificar el catálogo.", ephemeral: true });
    const name = i.options.getString("nombre");

    if (action === "agregar") {
      const newName = name.trim();
      if (products.some(p => String(p.name).toLowerCase() === newName.toLowerCase())) {
        return i.reply({ content: "Ese producto ya existe. Usa /tienda editar.", ephemeral: true });
      }
      const amount = i.options.getNumber("importe");
      const stock = i.options.getInteger("stock");
      const product = {
        id: randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase(),
        name: newName,
        price: i.options.getString("precio").trim(),
        priceAmount: amount === null ? null : Math.round((amount + Number.EPSILON) * 100) / 100,
        currency: CURRENCY,
        description: safeText(i.options.getString("descripcion"), 500),
        category: safeText(i.options.getString("categoria"), 40) || "General",
        stock: stock === null ? -1 : stock,
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      products.push(product);
      store.saveProducts(products);
      const cartNote = product.priceAmount === null ? " Añade el importe numérico más tarde para permitir compras desde /carrito." : "";
      return i.reply({ content: "✅ Producto añadido: **" + product.name + "** — **" + product.price + "** · " + stockLabel(product) + "." + cartNote, ephemeral: true, allowedMentions: { parse: [] } });
    }

    const index = products.findIndex(p => String(p.name).toLowerCase() === name.trim().toLowerCase());
    if (index < 0) return i.reply({ content: "No encontré ese producto en el catálogo.", ephemeral: true });
    const product = products[index];

    if (action === "editar") {
      const price = i.options.getString("precio");
      const description = i.options.getString("descripcion");
      const amount = i.options.getNumber("importe");
      const stock = i.options.getInteger("stock");
      const category = i.options.getString("categoria");
      const enabled = i.options.getBoolean("habilitado");
      if (price === null && description === null && amount === null && stock === null && category === null && enabled === null) {
        return i.reply({ content: "Indica al menos un campo para editar.", ephemeral: true });
      }
      if (price !== null) product.price = price.trim();
      if (description !== null) product.description = safeText(description, 500);
      if (amount !== null) {
        product.priceAmount = Math.round((amount + Number.EPSILON) * 100) / 100;
        product.currency = CURRENCY;
      }
      if (stock !== null) product.stock = stock;
      if (category !== null) product.category = safeText(category, 40) || "General";
      if (enabled !== null) product.enabled = enabled;
      product.updatedAt = new Date().toISOString();
      store.saveProducts(products);
      return i.reply({ content: "✅ Producto actualizado: **" + product.name + "** · " + stockLabel(product) + ".", ephemeral: true, allowedMentions: { parse: [] } });
    }

    products.splice(index, 1);
    store.saveProducts(products);
    return i.reply({ content: "✅ Producto eliminado del catálogo. Los pedidos ya creados conservan la copia de sus datos.", ephemeral: true, allowedMentions: { parse: [] } });
  }
};
