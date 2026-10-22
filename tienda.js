const { randomUUID } = require("crypto");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
const store = require("./store-service");
const orderService = require("./services/order-service");

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function productStock(product) {
  if (product.stock === undefined || product.stock === null || Number(product.stock) < 0) return "Ilimitado";
  return Number(product.stock) === 0 ? "Agotado" : String(Number(product.stock)) + " unidades";
}

function catalogDescription(products) {
  if (!products.length) return "El catálogo está vacío. El equipo puede añadir productos con /tienda agregar.";
  const lines = [];
  for (const product of products.slice(0, 25)) {
    const line = "✦ **" + String(product.name).slice(0, 80) + "** — **" + String(product.price).slice(0, 50) + "**\n" +
      (String(product.description || "Consulta por ticket para más información.").slice(0, 180)) +
      "\nStock: **" + productStock(product) + "**";
    if ((lines.join("\n\n") + "\n\n" + line).length > 3800) break;
    lines.push(line);
  }
  return lines.join("\n\n") || "Hay productos, pero sus descripciones son demasiado largas para mostrarlas.";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tienda")
    .setDescription("Catálogo e inventario de productos de FLUX STORE.")
    .addSubcommand(sub => sub.setName("catalogo").setDescription("Muestra productos y disponibilidad."))
    .addSubcommand(sub => sub.setName("agregar").setDescription("Añade un producto al catálogo.")
      .addStringOption(option => option.setName("nombre").setDescription("Nombre del producto").setMinLength(2).setMaxLength(80).setRequired(true))
      .addStringOption(option => option.setName("precio").setDescription("Precio numérico, por ejemplo 7,50€ o $5 USD").setMinLength(1).setMaxLength(40).setRequired(true))
      .addStringOption(option => option.setName("descripcion").setDescription("Detalles del producto").setMaxLength(500).setRequired(false))
      .addIntegerOption(option => option.setName("stock").setDescription("Unidades disponibles; -1 significa ilimitado").setMinValue(-1).setMaxValue(1000000).setRequired(false)))
    .addSubcommand(sub => sub.setName("editar").setDescription("Edita precio o descripción.")
      .addStringOption(option => option.setName("nombre").setDescription("Producto existente").setMaxLength(80).setAutocomplete(true).setRequired(true))
      .addStringOption(option => option.setName("precio").setDescription("Nuevo precio").setMaxLength(40).setRequired(false))
      .addStringOption(option => option.setName("descripcion").setDescription("Nueva descripción").setMaxLength(500).setRequired(false)))
    .addSubcommand(sub => sub.setName("eliminar").setDescription("Elimina un producto sin pedidos activos.")
      .addStringOption(option => option.setName("nombre").setDescription("Producto del catálogo").setMaxLength(80).setAutocomplete(true).setRequired(true)))
    .addSubcommand(sub => sub.setName("stock").setDescription("Actualiza el inventario.")
      .addStringOption(option => option.setName("nombre").setDescription("Producto del catálogo").setMaxLength(80).setAutocomplete(true).setRequired(true))
      .addIntegerOption(option => option.setName("cantidad").setDescription("-1 = ilimitado; 0 = agotado").setMinValue(-1).setMaxValue(1000000).setRequired(true))),
  async autocomplete(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const focused = interaction.options.getFocused(true);
    if (!["editar", "eliminar", "stock"].includes(subcommand) || focused.name !== "nombre") {
      return interaction.respond([]);
    }
    const query = normalize(focused.value);
    const choices = store.getProducts()
      .filter(product => normalize(product.name).includes(query))
      .slice(0, 25)
      .map(product => ({ name: String(product.name).slice(0, 100), value: String(product.name).slice(0, 100) }));
    return interaction.respond(choices);
  },
  async execute(interaction) {
    const action = interaction.options.getSubcommand();
    const products = store.getProducts();

    if (action === "catalogo") {
      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle("🛍️ Catálogo de FLUX STORE")
        .setDescription(catalogDescription(products))
        .setFooter({ text: "El inventario limitado se actualiza al registrar pedidos." });
      return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    }

    if (!store.isStoreStaff(interaction.member)) {
      return interaction.reply({ content: "❌ Solo el equipo autorizado puede modificar productos o stock.", ephemeral: true });
    }

    const name = String(interaction.options.getString("nombre") || "").trim();
    if (action === "agregar") {
      const newName = name;
      if (products.some(product => normalize(product.name) === normalize(newName))) {
        return interaction.reply({ content: "Ese producto ya existe. Usa /tienda editar.", ephemeral: true });
      }
      const price = interaction.options.getString("precio").trim();
      try { orderService.parsePrice(price); }
      catch (error) { return interaction.reply({ content: "❌ " + error.message, ephemeral: true }); }

      const stockInput = interaction.options.getInteger("stock");
      const product = {
        id: randomUUID().replace(/-/g, "").slice(0, 12),
        name: newName,
        price,
        description: interaction.options.getString("descripcion")?.trim() || "",
        stock: stockInput === null ? -1 : stockInput,
        enabled: true,
        updatedAt: new Date().toISOString()
      };
      products.push(product);
      store.saveProducts(products);
      return interaction.reply({
        content: "✅ Producto añadido: **" + product.name + "** — **" + product.price + "** · Stock: **" + productStock(product) + "**.",
        ephemeral: true,
        allowedMentions: { parse: [] }
      });
    }

    const idx = products.findIndex(product => normalize(product.name) === normalize(name));
    if (idx < 0) return interaction.reply({ content: "No encontré ese producto en el catálogo.", ephemeral: true });

    if (action === "editar") {
      const price = interaction.options.getString("precio");
      const description = interaction.options.getString("descripcion");
      if (price === null && description === null) {
        return interaction.reply({ content: "Indica un nuevo precio o una nueva descripción.", ephemeral: true });
      }
      if (price !== null) {
        try { orderService.parsePrice(price); }
        catch (error) { return interaction.reply({ content: "❌ " + error.message, ephemeral: true }); }
        products[idx].price = price.trim();
      }
      if (description !== null) products[idx].description = description.trim();
      products[idx].updatedAt = new Date().toISOString();
      store.saveProducts(products);
      return interaction.reply({ content: "✅ Producto actualizado: **" + products[idx].name + "**.", ephemeral: true });
    }

    if (action === "stock") {
      const amount = interaction.options.getInteger("cantidad");
      products[idx].stock = amount;
      products[idx].updatedAt = new Date().toISOString();
      store.saveProducts(products);
      return interaction.reply({
        content: "✅ Stock de **" + products[idx].name + "** actualizado a **" + productStock(products[idx]) + "**.",
        ephemeral: true
      });
    }

    const activeOrders = orderService.getOrders(interaction.guildId).filter(order =>
      normalize(order.product) === normalize(products[idx].name) &&
      !["completado", "cancelado"].includes(order.status)
    );
    if (activeOrders.length) {
      return interaction.reply({
        content: "❌ No puedo eliminar este producto: tiene " + activeOrders.length + " pedido(s) activo(s). Resuelve esos pedidos primero.",
        ephemeral: true
      });
    }
    const removed = products[idx].name;
    products.splice(idx, 1);
    store.saveProducts(products);
    return interaction.reply({ content: "✅ Producto **" + removed + "** eliminado del catálogo.", ephemeral: true });
  }
};
