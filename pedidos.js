const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
const store = require("./store-service");
const orderService = require("./services/order-service");

const PAYMENT_METHODS = [
  { name: "PayPal", value: "PayPal" },
  { name: "Binance Pay", value: "Binance Pay" },
  { name: "Pago móvil", value: "Pago móvil" },
  { name: "Transferencia bancaria", value: "Transferencia bancaria" },
  { name: "Criptomoneda", value: "Criptomoneda" },
  { name: "Otro / consultar por ticket", value: "Otro" }
];

function orderEmbed(order) {
  const subtotal = order.subtotalMinor === undefined
    ? String(order.price || "No disponible")
    : orderService.formatMoney(order.subtotalMinor, order.currency);
  const total = order.totalAmountMinor === undefined
    ? String(order.price || "No disponible")
    : orderService.formatMoney(order.totalAmountMinor, order.currency);
  const unit = order.unitPriceMinor === undefined
    ? String(order.price || "No disponible")
    : orderService.formatMoney(order.unitPriceMinor, order.currency);
  const discount = Number(order.discountMinor) > 0
    ? orderService.formatMoney(order.discountMinor, order.currency) + " (" + Number(order.discountPercent || 0) + "%)"
    : "Sin descuento";
  return new EmbedBuilder()
    .setColor(order.status === "completado" ? config.colors.success : order.status === "cancelado" ? config.colors.error : config.colors.primary)
    .setTitle("🧾 Pedido #" + order.id + " • FLUX STORE")
    .setDescription("**Cliente:** <@" + order.userId + ">\n**Producto:** " + String(order.product).slice(0, 180) +
      "\n**Estado:** " + (orderService.LABELS[order.status] || order.status))
    .addFields(
      { name: "Cantidad", value: String(Math.max(1, Number(order.quantity) || 1)), inline: true },
      { name: "Precio unitario", value: unit, inline: true },
      { name: "Subtotal", value: subtotal, inline: true },
      { name: "Descuento", value: discount, inline: true },
      { name: "Total", value: total, inline: true },
      { name: "Método elegido", value: String(order.paymentMethod || "No indicado").slice(0, 100), inline: true },
      { name: "Última actualización", value: order.updatedAt ? "<t:" + Math.floor(Date.parse(order.updatedAt) / 1000) + ":R>" : "No disponible", inline: true }
    )
    .setFooter({ text: "El pago solo se considera verificado cuando el equipo lo confirma." })
    .setTimestamp(new Date(order.createdAt || Date.now()));
}

function orderLine(order) {
  const total = Number.isFinite(Number(order.totalAmountMinor))
    ? orderService.formatMoney(order.totalAmountMinor, order.currency)
    : String(order.price || "Sin precio");
  return "**#" + order.id + " · " + String(order.product || "Producto desconocido").slice(0, 80) + "** — " + total +
    "\n" + (orderService.LABELS[order.status] || order.status) +
    " · <t:" + Math.floor(new Date(order.createdAt || Date.now()).getTime() / 1000) + ":d>";
}

function logChannel(guild) {
  const id = config.channels.orderLogs || config.channels.logs;
  const channel = guild.channels.cache.get(id);
  return channel?.isTextBased() ? channel : null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("pedido")
    .setDescription("Crea pedidos de catálogo, consulta historiales y actualiza estados.")
    .addSubcommand(sub => sub.setName("crear").setDescription("Pide un producto del catálogo.")
      .addStringOption(option => option.setName("producto").setDescription("Producto que deseas comprar").setMinLength(2).setMaxLength(100).setAutocomplete(true).setRequired(true))
      .addIntegerOption(option => option.setName("cantidad").setDescription("Cantidad de unidades").setMinValue(1).setMaxValue(99).setRequired(false))
      .addStringOption(option => option.setName("metodo").setDescription("Método de pago que usarás").addChoices(...PAYMENT_METHODS).setRequired(true))
      .addStringOption(option => option.setName("cupon").setDescription("Cupón de descuento opcional").setMaxLength(24).setRequired(false)))
    .addSubcommand(sub => sub.setName("mis-compras").setDescription("Consulta tus últimos pedidos."))
    .addSubcommand(sub => sub.setName("ver").setDescription("Consulta el detalle de un pedido tuyo o de un cliente (staff).")
      .addStringOption(option => option.setName("id").setDescription("ID del pedido").setMinLength(4).setMaxLength(12).setRequired(true)))
    .addSubcommand(sub => sub.setName("historial").setDescription("Consulta el historial de pedidos de un cliente (staff).")
      .addUserOption(option => option.setName("cliente").setDescription("Cliente a consultar").setRequired(false)))
    .addSubcommand(sub => sub.setName("estado").setDescription("Actualiza el estado de un pedido (staff).")
      .addStringOption(option => option.setName("id").setDescription("ID del pedido").setMinLength(4).setMaxLength(12).setRequired(true))
      .addStringOption(option => option.setName("estado").setDescription("Siguiente estado del pedido").setRequired(true).addChoices(
        { name: "Pago verificado", value: "pago_verificado" },
        { name: "En preparación", value: "procesando" },
        { name: "Completado", value: "completado" },
        { name: "Cancelar pedido", value: "cancelado" }
      ))),
  async autocomplete(interaction) {
    if (interaction.options.getSubcommand() !== "crear") return interaction.respond([]);
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "producto") return interaction.respond([]);
    const query = String(focused.value || "").toLowerCase();
    const products = store.getProducts()
      .filter(product => product.enabled !== false && (product.stock === undefined || product.stock === null || Number(product.stock) < 0 || Number(product.stock) > 0))
      .filter(product => String(product.name || "").toLowerCase().includes(query))
      .slice(0, 25)
      .map(product => ({ name: String(product.name).slice(0, 100), value: String(product.name).slice(0, 100) }));
    return interaction.respond(products);
  },
  async execute(interaction) {
    const action = interaction.options.getSubcommand();

    if (action === "crear") {
      let order;
      try {
        order = orderService.createOrder({
          guildId: interaction.guildId,
          userId: interaction.user.id,
          userTag: interaction.user.tag,
          productName: interaction.options.getString("producto"),
          quantity: interaction.options.getInteger("cantidad") || 1,
          paymentMethod: interaction.options.getString("metodo"),
          couponCode: interaction.options.getString("cupon") || ""
        });
      } catch (error) {
        return interaction.reply({ content: "❌ " + error.message, ephemeral: true });
      }
      await interaction.reply({ embeds: [orderEmbed(order)], ephemeral: true, allowedMentions: { parse: [] } });
      const log = logChannel(interaction.guild);
      if (log) {
        await log.send({
          content: "🧾 Nuevo pedido pendiente de verificación de pago.",
          embeds: [orderEmbed(order)],
          allowedMentions: { parse: [] }
        }).catch(error => console.error("No se pudo registrar el pedido en logs:", error?.message || error));
      }
      return;
    }

    if (action === "mis-compras") {
      const mine = orderService.getOrders(interaction.guildId)
        .filter(order => order.userId === interaction.user.id)
        .slice(-10).reverse();
      if (!mine.length) return interaction.reply({ content: "Todavía no tienes pedidos. Usa /pedido crear.", ephemeral: true });
      const description = mine.map(orderLine).join("\n\n").slice(0, 4000);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle("🧾 Tus pedidos de FLUX STORE")
          .setDescription(description).setFooter({ text: "Mostrando tus últimos 10 pedidos." })],
        ephemeral: true
      });
    }

    const isStaff = store.isStoreStaff(interaction.member);
    if (action === "ver") {
      const order = orderService.getOrderById(interaction.guildId, interaction.options.getString("id"));
      if (!order) return interaction.reply({ content: "❌ No encontré ese pedido en este servidor.", ephemeral: true });
      if (order.userId !== interaction.user.id && !isStaff) {
        return interaction.reply({ content: "❌ Solo puedes consultar tus propios pedidos.", ephemeral: true });
      }
      return interaction.reply({ embeds: [orderEmbed(order)], ephemeral: true, allowedMentions: { parse: [] } });
    }

    if (!isStaff) {
      return interaction.reply({ content: "❌ Solo el personal autorizado puede consultar historiales ajenos o cambiar estados.", ephemeral: true });
    }

    if (action === "historial") {
      const target = interaction.options.getUser("cliente") || interaction.user;
      const rows = orderService.getOrders(interaction.guildId)
        .filter(order => order.userId === target.id)
        .slice(-15).reverse();
      if (!rows.length) return interaction.reply({ content: "No hay pedidos registrados para ese cliente.", ephemeral: true });
      const description = rows.map(orderLine).join("\n\n").slice(0, 4000);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle("🧾 Historial de " + target.tag)
          .setDescription(description).setFooter({ text: "FLUX STORE • Solo personal autorizado." })],
        ephemeral: true
      });
    }

    const id = interaction.options.getString("id").trim().toUpperCase();
    const nextStatus = interaction.options.getString("estado");
    let result;
    try {
      result = orderService.changeOrderStatus({
        guildId: interaction.guildId,
        orderId: id,
        nextStatus,
        actorId: interaction.user.id
      });
    } catch (error) {
      return interaction.reply({ content: "❌ " + error.message, ephemeral: true });
    }
    if (!result.changed) {
      return interaction.reply({ content: "ℹ️ Ese pedido ya tiene el estado " + (orderService.LABELS[nextStatus] || nextStatus) + ".", ephemeral: true });
    }
    await store.refreshCounters(interaction.guild);
    await interaction.reply({
      content: "✅ Estado del pedido #" + result.order.id + " actualizado: **" + (orderService.LABELS[nextStatus] || nextStatus) + "**.",
      ephemeral: true
    });
    const log = logChannel(interaction.guild);
    if (log) {
      await log.send({
        content: "🧾 Estado actualizado por <@" + interaction.user.id + ">.",
        embeds: [orderEmbed(result.order)],
        allowedMentions: { parse: [] }
      }).catch(() => {});
    }
  }
};
