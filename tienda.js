const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
const store = require("./store-service");
module.exports = {
  data: new SlashCommandBuilder()
    .setName("tienda")
    .setDescription("Catálogo y administración de productos de Flux STORE.")
    .addSubcommand(s => s.setName("catalogo").setDescription("Muestra los productos actuales."))
    .addSubcommand(s => s.setName("agregar").setDescription("Añade un producto al catálogo.")
      .addStringOption(o => o.setName("nombre").setDescription("Nombre del producto").setMaxLength(80).setRequired(true))
      .addStringOption(o => o.setName("precio").setDescription("Precio como texto, por ejemplo 7 euros o $5").setMaxLength(40).setRequired(true))
      .addStringOption(o => o.setName("descripcion").setDescription("Detalles del producto").setMaxLength(500).setRequired(false)))
    .addSubcommand(s => s.setName("editar").setDescription("Edita el precio o descripción de un producto existente.")
      .addStringOption(o => o.setName("nombre").setDescription("Nombre exacto actual del producto").setMaxLength(80).setRequired(true))
      .addStringOption(o => o.setName("precio").setDescription("Nuevo precio").setMaxLength(40).setRequired(false))
      .addStringOption(o => o.setName("descripcion").setDescription("Nueva descripción").setMaxLength(500).setRequired(false)))
    .addSubcommand(s => s.setName("eliminar").setDescription("Elimina un producto del catálogo.")
      .addStringOption(o => o.setName("nombre").setDescription("Nombre exacto del producto").setMaxLength(80).setRequired(true))),
  async execute(i) {
    const action = i.options.getSubcommand(), products = store.getProducts();
    if (action === "catalogo") {
      const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle("🛍️ ᴄᴀᴛáʟᴏɢᴏ ᴅᴇ ғʟᴜx sᴛᴏʀᴇ")
        .setDescription(products.length ? products.slice(0, 25).map(p => "✦ **" + p.name + "** — **" + p.price + "**\n" + (p.description || "Consulta por ticket para más información.")).join("\n\n") : "El catálogo está vacío. El equipo puede añadir productos con /tienda agregar.")
        .setFooter({ text: "Flux STORE • Precios y productos pueden cambiar" });
      return i.reply({ embeds: [embed] });
    }
    if (!store.isStoreStaff(i.member)) return i.reply({ content: "❌ Necesitas permiso de tienda/administración para modificar el catálogo.", ephemeral: true });
    const name = i.options.getString("nombre");
    if (action === "agregar") {
      const newName = name.trim();
      if (products.some(p => p.name.toLowerCase() === newName.toLowerCase())) return i.reply({ content: "Ese producto ya existe. Usa la opción editar.", ephemeral: true });
      const product = { name: newName, price: i.options.getString("precio").trim(), description: i.options.getString("descripcion")?.trim() || "", updatedAt: new Date().toISOString() };
      products.push(product); store.saveProducts(products);
      return i.reply({ content: "✅ Producto añadido: **" + product.name + "** — **" + product.price + "**.", ephemeral: true });
    }
    const idx = products.findIndex(p => p.name.toLowerCase() === name.trim().toLowerCase());
    if (idx < 0) return i.reply({ content: "No encontré ese producto en el catálogo.", ephemeral: true });
    if (action === "editar") {
      const price = i.options.getString("precio"), description = i.options.getString("descripcion");
      if (!price && description === null) return i.reply({ content: "Indica un nuevo precio o una nueva descripción.", ephemeral: true });
      if (price) products[idx].price = price.trim();
      if (description !== null) products[idx].description = description.trim();
      products[idx].updatedAt = new Date().toISOString(); store.saveProducts(products);
      return i.reply({ content: "✅ Producto actualizado: **" + products[idx].name + "**.", ephemeral: true });
    }
    products.splice(idx, 1); store.saveProducts(products);
    return i.reply({ content: "✅ Producto eliminado del catálogo.", ephemeral: true });
  }
};
