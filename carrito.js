"use strict";

const {
  SlashCommandBuilder, EmbedBuilder, ChannelType
} = require("discord.js");
const config = require("./config");
const commerce = require("./commerce-service");

function cartEmbed(view) {
  const lines = view.lines.map(function (item) {
    const stock = item.stock === null ? "Stock ilimitado" : "Stock disponible: " + item.stock;
    return "• **" + item.productName + " × " + item.quantity + "** — " +
      commerce.money(item.lineCents, view.currency) + "\n  " + stock;
  });
  return new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle("🛒 Carrito de FLUX STORE")
    .setDescription(lines.length ? lines.join("\n") : "Tu carrito está vacío. Usa /carrito agregar para empezar.")
    .addFields({ name: "Subtotal", value: "**" + commerce.money(view.subtotalCents, view.currency) + "**" })
    .setFooter({ text: "Los precios y el stock se verifican nuevamente al confirmar el pedido." })
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("carrito")
    .setDescription("Añade productos, revisa tu carrito y genera pedidos de FLUX STORE.")
    .addSubcommand(function (s) {
      return s.setName("agregar").setDescription("Añade un producto del catálogo.")
        .addStringOption(function (o) {
          return o.setName("producto").setDescription("Nombre exacto del producto del catálogo")
            .setMinLength(1).setMaxLength(80).setRequired(true);
        })
        .addIntegerOption(function (o) {
          return o.setName("cantidad").setDescription("Cantidad de unidades")
            .setMinValue(1).setMaxValue(commerce.MAX_QUANTITY).setRequired(true);
        });
    })
    .addSubcommand(function (s) {
      return s.setName("ver").setDescription("Muestra tu carrito actual.");
    })
    .addSubcommand(function (s) {
      return s.setName("quitar").setDescription("Quita un producto del carrito.")
        .addStringOption(function (o) {
          return o.setName("producto").setDescription("Producto que quieres quitar")
            .setMinLength(1).setMaxLength(80).setRequired(true);
        });
    })
    .addSubcommand(function (s) {
      return s.setName("vaciar").setDescription("Vacía tu carrito.");
    })
    .addSubcommand(function (s) {
      return s.setName("confirmar").setDescription("Crea el pedido y reserva el stock disponible.")
        .addStringOption(function (o) {
          return o.setName("metodo").setDescription("Método de pago preferido").setRequired(true)
            .addChoices(
              { name: "PayPal", value: "PayPal" },
              { name: "Binance Pay", value: "Binance Pay" },
              { name: "Pago móvil", value: "Pago móvil" },
              { name: "Transferencia", value: "Transferencia" },
              { name: "Otro / consultar", value: "Otro / consultar" }
            );
        })
        .addStringOption(function (o) {
          return o.setName("cupon").setDescription("Código de descuento, si tienes uno")
            .setMinLength(3).setMaxLength(24).setRequired(false);
        })
        .addStringOption(function (o) {
          return o.setName("detalles").setDescription("Información adicional del pedido")
            .setMaxLength(500).setRequired(false);
        });
    }),
  async execute(i) {
    if (!i.guildId) {
      return i.reply({ content: "Este comando solo funciona dentro del servidor de FLUX STORE.", ephemeral: true });
    }

    const action = i.options.getSubcommand();
    try {
      if (action === "agregar") {
        const view = commerce.addToCart(
          i.guildId, i.user.id, i.options.getString("producto"),
          i.options.getInteger("cantidad")
        );
        return i.reply({
          content: "✅ Producto añadido al carrito. Revisa el resumen antes de confirmar.",
          embeds: [cartEmbed(view)],
          ephemeral: true
        });
      }

      if (action === "ver") {
        return i.reply({
          embeds: [cartEmbed(commerce.calculateCart(i.guildId, i.user.id))],
          ephemeral: true
        });
      }

      if (action === "quitar") {
        commerce.removeFromCart(i.guildId, i.user.id, i.options.getString("producto"));
        const view = commerce.calculateCart(i.guildId, i.user.id);
        return i.reply({
          content: "✅ Producto quitado del carrito.",
          embeds: [cartEmbed(view)],
          ephemeral: true
        });
      }

      if (action === "vaciar") {
        commerce.clearCart(i.guildId, i.user.id);
        return i.reply({ content: "🧹 Tu carrito está vacío.", ephemeral: true });
      }

      const order = commerce.checkout({
        guildId: i.guildId,
        userId: i.user.id,
        userTag: i.user.tag,
        paymentMethod: i.options.getString("metodo"),
        couponCode: i.options.getString("cupon"),
        details: i.options.getString("detalles")
      });

      const embed = new EmbedBuilder()
        .setColor(config.colors.success)
        .setTitle("🧾 Pedido creado correctamente")
        .setDescription(
          "**Pedido:** #" + order.id +
          "\n**Productos:** " + order.product +
          "\n**Subtotal:** " + commerce.money(order.subtotalCents, order.currency) +
          "\n**Descuento:** " + commerce.money(order.discountCents, order.currency) +
          "\n**Total:** **" + order.price + "**" +
          "\n**Método elegido:** " + order.paymentMethod +
          "\n**Estado:** 🟡 Pendiente" +
          (order.couponCode ? "\n**Cupón aplicado:** " + order.couponCode : "")
        )
        .setFooter({ text: "FLUX STORE • El pago debe ser verificado por el equipo." })
        .setTimestamp();

      const logId = config.channels.logs;
      if (logId) {
        const logChannel = await i.guild.channels.fetch(logId).catch(function () { return null; });
        if (logChannel && logChannel.type === ChannelType.GuildText) {
          await logChannel.send({
            content: "🛒 Nuevo pedido de <@" + order.userId + "> · #" + order.id,
            embeds: [embed],
            allowedMentions: { parse: [] }
          }).catch(function (error) {
            console.error("No se pudo registrar el pedido en el canal de logs:", error.message);
          });
        }
      }

      return i.reply({
        content: "✅ Tu pedido quedó registrado. Guarda el identificador para consultar su estado con /pedido mis-compras.",
        embeds: [embed],
        ephemeral: true
      });
    } catch (error) {
      return i.reply({
        content: "❌ " + String(error && error.message ? error.message : "No pude procesar el carrito.").slice(0, 1800),
        ephemeral: true
      });
    }
  }
};
