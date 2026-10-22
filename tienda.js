"use strict";

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
const store = require("./store-service");
const commerce = require("./commerce-service");

function findProduct(products, name) {
  return products.find(function (p) {
    return String(p.name || "").trim().toLowerCase() === String(name || "").trim().toLowerCase();
  });
}

function stockText(product) {
  if (!Object.prototype.hasOwnProperty.call(product, "stock")) return "Stock: ilimitado";
  const stock = Number(product.stock);
  return stock > 0 ? "Stock: " + stock : "⛔ Agotado";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("tienda")
    .setDescription("Catálogo y administración de productos de FLUX STORE.")
    .addSubcommand(function (s) {
      return s.setName("catalogo").setDescription("Muestra los productos disponibles.");
    })
    .addSubcommand(function (s) {
      return s.setName("agregar").setDescription("Añade un producto al catálogo.")
        .addStringOption(function (o) {
          return o.setName("nombre").setDescription("Nombre del producto")
            .setMaxLength(80).setRequired(true);
        })
        .addStringOption(function (o) {
          return o.setName("precio").setDescription("Precio único, por ejemplo 7.50 USD")
            .setMaxLength(40).setRequired(true);
        })
        .addStringOption(function (o) {
          return o.setName("descripcion").setDescription("Detalles del producto")
            .setMaxLength(500).setRequired(false);
        })
        .addIntegerOption(function (o) {
          return o.setName("stock").setDescription("Unidades disponibles; déjalo vacío para stock ilimitado")
            .setMinValue(0).setMaxValue(1000000).setRequired(false);
        });
    })
    .addSubcommand(function (s) {
      return s.setName("editar").setDescription("Edita el precio o descripción de un producto.")
        .addStringOption(function (o) {
          return o.setName("nombre").setDescription("Nombre exacto actual del producto")
            .setMaxLength(80).setRequired(true);
        })
        .addStringOption(function (o) {
          return o.setName("precio").setDescription("Nuevo precio único")
            .setMaxLength(40).setRequired(false);
        })
        .addStringOption(function (o) {
          return o.setName("descripcion").setDescription("Nueva descripción")
            .setMaxLength(500).setRequired(false);
        });
    })
    .addSubcommand(function (s) {
      return s.setName("stock").setDescription("Establece las unidades disponibles de un producto.")
        .addStringOption(function (o) {
          return o.setName("nombre").setDescription("Nombre exacto del producto")
            .setMaxLength(80).setRequired(true);
        })
        .addIntegerOption(function (o) {
          return o.setName("cantidad").setDescription("Nuevo stock; 0 lo marca como agotado")
            .setMinValue(0).setMaxValue(1000000).setRequired(true);
        });
    })
    .addSubcommand(function (s) {
      return s.setName("disponibilidad").setDescription("Activa o pausa temporalmente un producto.")
        .addStringOption(function (o) {
          return o.setName("nombre").setDescription("Nombre exacto del producto")
            .setMaxLength(80).setRequired(true);
        })
        .addBooleanOption(function (o) {
          return o.setName("activo").setDescription("Si el producto se puede comprar")
            .setRequired(true);
        });
    })
    .addSubcommand(function (s) {
      return s.setName("eliminar").setDescription("Elimina un producto del catálogo.")
        .addStringOption(function (o) {
          return o.setName("nombre").setDescription("Nombre exacto del producto")
            .setMaxLength(80).setRequired(true);
        });
    })
    .addSubcommand(function (s) {
      return s.setName("cupon-crear").setDescription("Crea un cupón de descuento para este servidor.")
        .addStringOption(function (o) {
          return o.setName("codigo").setDescription("Ejemplo: FLUX10").setMinLength(3).setMaxLength(24).setRequired(true);
        })
        .addIntegerOption(function (o) {
          return o.setName("porcentaje").setDescription("Descuento del 1 al 90 %").setMinValue(1).setMaxValue(90).setRequired(true);
        })
        .addIntegerOption(function (o) {
          return o.setName("usos-maximos").setDescription("Déjalo vacío para usos ilimitados").setMinValue(1).setMaxValue(1000000).setRequired(false);
        });
    })
    .addSubcommand(function (s) {
      return s.setName("cupon-eliminar").setDescription("Elimina un cupón de este servidor.")
        .addStringOption(function (o) {
          return o.setName("codigo").setDescription("Código exacto del cupón").setMinLength(3).setMaxLength(24).setRequired(true);
        });
    })
    .addSubcommand(function (s) {
      return s.setName("cupones").setDescription("Lista los cupones de este servidor (solo personal).");
    }),
  async execute(i) {
    const action = i.options.getSubcommand();
    const products = store.getProducts();

    if (["cupon-crear", "cupon-eliminar", "cupones"].includes(action)) {
      if (!store.isStoreStaff(i.member)) {
        return i.reply({ content: "❌ Solo el personal autorizado puede administrar cupones.", ephemeral: true });
      }
      if (action === "cupon-crear") {
        try {
          const coupon = commerce.createCoupon(
            i.guildId,
            i.options.getString("codigo"),
            i.options.getInteger("porcentaje"),
            i.options.getInteger("usos-maximos")
          );
          return i.reply({
            content: "✅ Cupón **" + coupon.code + "** creado: **" + coupon.percent + "%** de descuento · " +
              (coupon.maxUses === null ? "usos ilimitados" : "máximo " + coupon.maxUses + " usos") + ".",
            ephemeral: true
          });
        } catch (error) {
          return i.reply({ content: "❌ " + error.message, ephemeral: true });
        }
      }
      if (action === "cupon-eliminar") {
        const removed = commerce.removeCoupon(i.guildId, i.options.getString("codigo"));
        return i.reply({
          content: removed ? "✅ Cupón eliminado." : "❌ No encontré ese cupón en este servidor.",
          ephemeral: true
        });
      }
      const coupons = commerce.listCoupons(i.guildId);
      const description = coupons.slice(0, 25).map(c =>
        "`" + c.code + "` — " + c.percent + "% · usos " + Number(c.uses || 0) +
        (c.maxUses == null ? "/∞" : "/" + c.maxUses) + (c.enabled === false ? " · desactivado" : "")
      ).join("\n");
      return i.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle("🎟️ Cupones de FLUX STORE")
          .setDescription(description || "No hay cupones configurados.")],
        ephemeral: true
      });
    }

    if (action === "catalogo") {
      const available = products.filter(function (p) {
        return p.enabled !== false && p.active !== false &&
          (!Object.prototype.hasOwnProperty.call(p, "stock") || Number(p.stock) > 0);
      });
      const description = available.slice(0, 25).map(function (p) {
        return "✦ **" + String(p.name).slice(0, 80) + "** — **" + String(p.price).slice(0, 40) + "**\n" +
          (String(p.description || "Consulta por ticket para más información.").slice(0, 350)) +
          "\n_" + stockText(p) + "_";
      }).join("\n\n");
      const embed = new EmbedBuilder().setColor(config.colors.primary)
        .setTitle("🛍️ Catálogo de FLUX STORE")
        .setDescription(description || "Ahora mismo no hay productos disponibles.")
        .setFooter({ text: "Los pedidos se confirman con /carrito; el stock se revisa al pagar." });
      return i.reply({ embeds: [embed] });
    }

    if (!store.isStoreStaff(i.member)) {
      return i.reply({ content: "❌ Solo el personal autorizado puede modificar el catálogo.", ephemeral: true });
    }

    const name = i.options.getString("nombre");
    if (action === "agregar") {
      const newName = name.trim();
      const price = i.options.getString("precio").trim();
      if (!newName) return i.reply({ content: "Indica un nombre válido.", ephemeral: true });
      if (findProduct(products, newName)) {
        return i.reply({ content: "Ese producto ya existe. Usa /tienda editar.", ephemeral: true });
      }

      let priceCents;
      try { priceCents = commerce.parsePrice(price); }
      catch (error) {
        return i.reply({ content: "❌ " + error.message, ephemeral: true });
      }

      const initialStock = i.options.getInteger("stock");
      const product = {
        name: newName,
        price: price,
        description: (i.options.getString("descripcion") || "").trim(),
        enabled: true,
        updatedAt: new Date().toISOString()
      };
      if (initialStock !== null) product.stock = initialStock;
      products.push(product);
      store.saveProducts(products);

      return i.reply({
        content: "✅ Producto añadido: **" + newName + "** — **" +
          commerce.money(priceCents, commerce.CURRENCY) + "** · " +
          (initialStock === null ? "stock ilimitado" : "stock inicial: " + initialStock) + ".",
        ephemeral: true
      });
    }

    const product = findProduct(products, name);
    if (!product) return i.reply({ content: "No encontré ese producto en el catálogo.", ephemeral: true });

    if (action === "stock") {
      product.stock = i.options.getInteger("cantidad");
      product.updatedAt = new Date().toISOString();
      store.saveProducts(products);
      return i.reply({
        content: product.stock === 0
          ? "✅ **" + product.name + "** queda marcado como agotado."
          : "✅ Stock de **" + product.name + "** actualizado a **" + product.stock + "** unidades.",
        ephemeral: true
      });
    }

    if (action === "disponibilidad") {
      product.enabled = i.options.getBoolean("activo");
      product.updatedAt = new Date().toISOString();
      store.saveProducts(products);
      return i.reply({
        content: (product.enabled ? "✅ Producto activado: **" : "⏸️ Producto pausado: **") + product.name + "**.",
        ephemeral: true
      });
    }

    if (action === "editar") {
      const price = i.options.getString("precio");
      const description = i.options.getString("descripcion");
      if (price === null && description === null) {
        return i.reply({ content: "Indica un nuevo precio o una nueva descripción.", ephemeral: true });
      }
      if (price !== null) {
        try { commerce.parsePrice(price); }
        catch (error) { return i.reply({ content: "❌ " + error.message, ephemeral: true }); }
        product.price = price.trim();
      }
      if (description !== null) product.description = description.trim();
      product.updatedAt = new Date().toISOString();
      store.saveProducts(products);
      return i.reply({ content: "✅ Producto actualizado: **" + product.name + "**.", ephemeral: true });
    }

    const reserved = commerce.getOrders().some(function (order) {
      if (order.guildId !== i.guildId || !["pendiente", "pago_verificado", "procesando"].includes(order.status)) return false;
      return Array.isArray(order.items) && order.items.some(function (item) {
        return commerce.normalize(item.productName) === commerce.normalize(product.name) && item.stockTracked;
      });
    });
    if (reserved) {
      return i.reply({ content: "❌ No puedes eliminar ese producto mientras haya pedidos pendientes que tengan stock reservado. Completa o cancela primero esos pedidos.", ephemeral: true });
    }

    products.splice(products.indexOf(product), 1);
    store.saveProducts(products);
    return i.reply({
      content: "✅ Producto eliminado del catálogo. Los pedidos ya registrados conservan su historial.",
      ephemeral: true
    });
  }
};
