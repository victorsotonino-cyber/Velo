const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");
const store = require("../../store-service");
const cartService = require("../../services/cart-service");
const orderService = require("../../services/order-service");

const PAYMENT_METHODS = [
  { name: "PayPal", value: "PayPal" },
  { name: "Binance Pay", value: "Binance Pay" },
  { name: "Pago móvil", value: "Pago móvil" },
  { name: "Transferencia bancaria", value: "Transferencia bancaria" },
  { name: "Criptomoneda", value: "Criptomoneda" },
  { name: "Otro / consultar por ticket", value: "Otro" }
];

function moneyLines(summary) {
  const totals = Object.entries(summary.subtotalByCurrency);
  if (!totals.length) return "Sin productos con precio calculable.";
  return totals.map(([currency, amount]) => "**" + currency + ": " + orderService.formatMoney(amount, currency) + "**").join("\n");
}

function cartEmbed(summary) {
  const lines = summary.lines.map((line, index) => {
    if (line.missing) return "⚠️ **" + line.productName + "** × " + line.quantity + "\n_" + line.message + "_";
    return (index + 1) + ". **" + line.productName + "** × " + line.quantity + " — " +
      orderService.formatMoney(line.subtotalMinor, line.currency) +
      "\nPrecio unitario: " + orderService.formatMoney(line.unitPriceMinor, line.currency) +
      " · Stock ahora: " + line.stock +
      (line.available ? "" : " · ⚠️ No hay suficiente stock");
  });
  return new EmbedBuilder()
    .setColor(config.colors.primary)
    .setTitle("🛒 Carrito de FLUX STORE")
    .setDescription((lines.join("\n\n") || "Tu carrito está vacío.") .slice(0, 3900))
    .addFields(
      { name: "Unidades", value: String(summary.totalUnits), inline: true },
      { name: "Productos distintos", value: String(summary.lines.length), inline: true },
      { name: "Subtotal estimado", value: moneyLines(summary), inline: false }
    )
    .setFooter({ text: "El stock se comprueba y reserva al finalizar la compra; los precios vienen del catálogo." })
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("carrito")
    .setDescription("Gestiona tu carrito de productos de FLUX STORE.")
    .addSubcommand(sub => sub.setName("agregar").setDescription("Añade un producto al carrito.")
      .addStringOption(option => option.setName("producto").setDescription("Producto del catálogo").setMinLength(2).setMaxLength(100).setAutocomplete(true).setRequired(true))
      .addIntegerOption(option => option.setName("cantidad").setDescription("Unidades (por defecto 1)").setMinValue(1).setMaxValue(99).setRequired(false)))
    .addSubcommand(sub => sub.setName("ver").setDescription("Consulta tu carrito y subtotal."))
    .addSubcommand(sub => sub.setName("quitar").setDescription("Quita un producto del carrito.")
      .addStringOption(option => option.setName("producto").setDescription("Producto que deseas retirar").setMinLength(2).setMaxLength(100).setAutocomplete(true).setRequired(true)))
    .addSubcommand(sub => sub.setName("vaciar").setDescription("Vacía todos los productos del carrito."))
    .addSubcommand(sub => sub.setName("checkout").setDescription("Crea pedidos a partir de tu carrito.")
      .addStringOption(option => option.setName("metodo").setDescription("Método de pago para estos pedidos").addChoices(...PAYMENT_METHODS).setRequired(true))),
  async autocomplete(interaction) {
    const action = interaction.options.getSubcommand();
    const focused = interaction.options.getFocused(true);
    if (!["agregar", "quitar"].includes(action) || focused.name !== "producto") {
      return interaction.respond([]);
    }
    const query = String(focused.value || "").trim().toLowerCase();
    return interaction.respond(store.getProducts()
      .filter(product => product.enabled !== false && String(product.name || "").toLowerCase().includes(query))
      .slice(0, 25)
      .map(product => ({ name: String(product.name).slice(0, 100), value: String(product.name).slice(0, 100) })));
  },
  async execute(interaction) {
    const action = interaction.options.getSubcommand();

    if (action === "agregar") {
      try {
        const cart = cartService.addItem(
          interaction.guildId,
          interaction.user.id,
          interaction.options.getString("producto"),
          interaction.options.getInteger("cantidad") || 1
        );
        const summary = cartService.getCartSummary(interaction.guildId, interaction.user.id);
        return interaction.reply({
          content: "✅ Producto agregado al carrito. Tienes **" + cart.items.length + "** productos distintos.\n" +
            "Subtotal estimado:\n" + moneyLines(summary) + "\nConsulta con /carrito ver y finaliza con /carrito checkout.",
          ephemeral: true,
          allowedMentions: { parse: [] }
        });
      } catch (error) {
        return interaction.reply({ content: "❌ " + error.message, ephemeral: true });
      }
    }

    if (action === "quitar") {
      const result = cartService.removeItem(
        interaction.guildId,
        interaction.user.id,
        interaction.options.getString("producto")
      );
      if (!result.removed) {
        return interaction.reply({ content: "No encontré ese producto en tu carrito.", ephemeral: true });
      }
      const summary = cartService.getCartSummary(interaction.guildId, interaction.user.id);
      return interaction.reply({ content: "✅ Producto retirado del carrito.\n" + moneyLines(summary), ephemeral: true });
    }

    if (action === "vaciar") {
      const changed = cartService.clearCart(interaction.guildId, interaction.user.id);
      return interaction.reply({
        content: changed ? "✅ Tu carrito está vacío." : "Tu carrito ya estaba vacío.",
        ephemeral: true
      });
    }

    const summary = cartService.getCartSummary(interaction.guildId, interaction.user.id);
    if (action === "ver") {
      return interaction.reply({
        embeds: [cartEmbed(summary)],
        ephemeral: true,
        allowedMentions: { parse: [] }
      });
    }

    let checkout;
    try {
      checkout = cartService.checkout({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        paymentMethod: interaction.options.getString("metodo")
      });
    } catch (error) {
      return interaction.reply({ content: "❌ " + error.message, ephemeral: true });
    }

    const created = checkout.createdOrders;
    const failed = checkout.failedItems;
    if (!created.length) {
      const message = failed.length
        ? "❌ No se creó ningún pedido. Tu carrito se ha conservado.\n" + failed.map(item => "• **" + item.productName + "**: " + item.reason).join("\n").slice(0, 1500)
        : "Tu carrito está vacío.";
      return interaction.reply({ content: message, ephemeral: true, allowedMentions: { parse: [] } });
    }

    const successLines = created.map(order =>
      "✅ Pedido **#" + order.id + "** · " + order.product + " × " + order.quantity + " — " +
      orderService.formatMoney(order.totalAmountMinor, order.currency) + " · Pendiente de pago"
    );
    const failedLines = failed.map(item => "⚠️ **" + item.productName + "** × " + item.quantity + ": " + item.reason);
    const description = successLines.concat(failedLines).join("\n").slice(0, 3900);
    const embed = new EmbedBuilder()
      .setColor(failed.length ? config.colors.warning : config.colors.success)
      .setTitle(failed.length ? "🧾 Checkout parcial" : "🧾 Pedidos creados")
      .setDescription(description)
      .setFooter({ text: "El pago no se considera verificado hasta que el personal lo confirme." })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
      allowedMentions: { parse: [] }
    });

    const logId = config.channels.orderLogs || config.channels.logs;
    const log = interaction.guild.channels.cache.get(logId);
    if (log?.isTextBased()) {
      for (const order of created) {
        await log.send({
          content: "🛒 Pedido creado desde el carrito de <@" + order.userId + ">.",
          embeds: [new EmbedBuilder().setColor(config.colors.primary)
            .setTitle("Pedido #" + order.id + " • FLUX STORE")
            .setDescription("**Producto:** " + order.product + " × " + order.quantity +
              "\n**Total:** " + orderService.formatMoney(order.totalAmountMinor, order.currency) +
              "\n**Método elegido:** " + order.paymentMethod + "\n**Estado:** Pendiente de pago")
            .setTimestamp(new Date(order.createdAt))],
          allowedMentions: { parse: [] }
        }).catch(error => console.error("No se pudo registrar pedido desde carrito:", error?.message || error));
      }
    }
  }
};
