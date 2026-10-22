const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
const store = require("./store-service");
const orderService = require("./order-service");

const LABELS = {
  pendiente: "🟡 Pendiente",
  pago_verificado: "🔵 Pago verificado",
  procesando: "🟣 En preparación",
  completado: "🟢 Completado",
  cancelado: "🔴 Cancelado"
};

function orderLine(order) {
  const created = Date.parse(order.createdAt);
  const stamp = Number.isFinite(created) ? " · <t:" + Math.floor(created / 1000) + ":d>" : "";
  const productText = Array.isArray(order.items) && order.items.length
    ? order.items.map(item => Number(item.quantity) + "× " + String(item.productName || item.name || "Producto")).join(", ")
    : String(order.product || "Solicitud de tienda");
  const price = order.price || (Number.isFinite(Number(order.totalAmount)) ? Number(order.totalAmount).toFixed(2) + " " + String(order.currency || process.env.STORE_CURRENCY || "USD") : "Precio por verificar");
  return "**#" + order.id + " · " + productText.slice(0, 250) + "** — " + price +
    "\nEstado: " + (LABELS[order.status] || order.status) + stamp;
}

module.exports = {
  data: new SlashCommandBuilder().setName("pedido").setDescription("Crea solicitudes y consulta el estado de pedidos de FLUX STORE.")
    .addSubcommand(s => s.setName("crear").setDescription("Registra una solicitud manual para atender por ticket.")
      .addStringOption(o => o.setName("producto").setDescription("Producto o servicio solicitado").setMinLength(2).setMaxLength(100).setRequired(true))
      .addStringOption(o => o.setName("precio").setDescription("Precio comunicado al cliente (no verificado)").setMaxLength(40).setRequired(true))
      .addStringOption(o => o.setName("metodo").setDescription("Método de pago previsto").setMinLength(2).setMaxLength(60).setRequired(true))
      .addStringOption(o => o.setName("detalles").setDescription("Información adicional").setMaxLength(500).setRequired(false)))
    .addSubcommand(s => s.setName("mis-compras").setDescription("Consulta tus últimos pedidos."))
    .addSubcommand(s => s.setName("historial").setDescription("Consulta el historial de un cliente (staff).")
      .addUserOption(o => o.setName("cliente").setDescription("Cliente a consultar").setRequired(false)))
    .addSubcommand(s => s.setName("estado").setDescription("Avanza el estado de un pedido (staff).")
      .addStringOption(o => o.setName("id").setDescription("ID del pedido").setMinLength(4).setMaxLength(12).setRequired(true))
      .addStringOption(o => o.setName("estado").setDescription("Nuevo estado").setRequired(true).addChoices(
        { name: "Pendiente", value: "pendiente" },
        { name: "Pago verificado", value: "pago_verificado" },
        { name: "En preparación", value: "procesando" },
        { name: "Completado", value: "completado" },
        { name: "Cancelado", value: "cancelado" }))),
  async execute(i) {
    if (!i.guildId) return i.reply({ content: "Este comando solo funciona en un servidor.", ephemeral: true });
    const action = i.options.getSubcommand();
    const orders = orderService.readOrders();

    if (action === "crear") {
      const product = i.options.getString("producto").trim();
      const price = i.options.getString("precio").trim();
      const method = i.options.getString("metodo").trim();
      const details = i.options.getString("detalles")?.trim() || "";
      const now = new Date().toISOString();
      const order = orderService.createOrder({
        source: "manual",
        guildId: i.guildId,
        userId: i.user.id,
        userTag: i.user.tag,
        product,
        items: [],
        price,
        paymentMethod: method,
        details,
        status: "pendiente",
        createdAt: now,
        updatedAt: now,
        statusHistory: [{ status: "pendiente", by: i.user.id, at: now }]
      });
      const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle("🧾 Solicitud registrada · #" + order.id)
        .setDescription("**Producto/servicio:** " + product + "\n**Precio comunicado:** " + price + "\n**Método previsto:** " + method +
          (details ? "\n**Detalles:** " + details : "") + "\n**Estado:** " + LABELS.pendiente)
        .setFooter({ text: "Solicitud manual: el precio escrito por el cliente no confirma el precio final ni el pago. Usa /carrito comprar para pedidos calculados desde el catálogo." })
        .setTimestamp();
      return i.reply({ embeds: [embed], ephemeral: true, allowedMentions: { parse: [] } });
    }

    if (action === "mis-compras") {
      const mine = orders.filter(order => order.guildId === i.guildId && order.userId === i.user.id).slice(-10).reverse();
      if (!mine.length) return i.reply({ content: "Todavía no tienes pedidos. Usa /carrito agregar y /carrito comprar o /pedido crear.", ephemeral: true });
      return i.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle("🧾 Tus pedidos de FLUX STORE")
          .setDescription(mine.map(orderLine).join("\n\n").slice(0, 4000)).setFooter({ text: "Mostrando tus últimos 10 pedidos." })],
        ephemeral: true,
        allowedMentions: { parse: [] }
      });
    }

    if (!store.isStoreStaff(i.member)) {
      return i.reply({ content: "❌ Solo el personal autorizado puede consultar historiales ajenos o cambiar estados.", ephemeral: true });
    }

    if (action === "historial") {
      const target = i.options.getUser("cliente") || i.user;
      const rows = orders.filter(order => order.guildId === i.guildId && order.userId === target.id).slice(-15).reverse();
      if (!rows.length) return i.reply({ content: "No hay pedidos registrados para ese cliente.", ephemeral: true });
      return i.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle("🧾 Historial de " + target.tag)
          .setDescription(rows.map(orderLine).join("\n\n").slice(0, 4000)).setFooter({ text: "FLUX STORE • Solo personal autorizado." })],
        ephemeral: true,
        allowedMentions: { parse: [] }
      });
    }

    const id = i.options.getString("id").trim().toUpperCase();
    const next = i.options.getString("estado");
    const result = orderService.transitionOrder(i.guildId, id, next, i.user.id);
    if (!result.ok) {
      return i.reply({ content: "❌ " + result.reason, ephemeral: true, allowedMentions: { parse: [] } });
    }
    if (result.unchanged) {
      return i.reply({ content: "ℹ️ El pedido #" + result.order.id + " ya estaba en estado " + LABELS[next] + ".", ephemeral: true });
    }

    const order = result.order;
    const description = "**Pedido:** #" + order.id + "\n**Cliente:** <@" + order.userId + ">\n**Producto:** " +
      String(order.product || "Pedido desde el carrito").slice(0, 500) + "\n**Estado:** " + LABELS[next] + "\n**Actualizado por:** <@" + i.user.id + ">";
    const embed = new EmbedBuilder().setColor(next === "cancelado" ? config.colors.warning : config.colors.success)
      .setTitle("✅ Estado de pedido actualizado").setDescription(description)
      .setFooter({ text: order.stockRestockedAt ? "El stock disponible fue devuelto al catálogo." : "Los pedidos del carrito validan stock y cupón al verificar el pago." })
      .setTimestamp();
    return i.reply({ embeds: [embed], ephemeral: true, allowedMentions: { parse: [] } });
  }
};
