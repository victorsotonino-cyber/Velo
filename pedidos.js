const { randomUUID } = require("crypto");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
const store = require("./store-service");
const { readJSON, writeJSON } = require("./storage");
const FILE = "flux-store-orders.json";
const LABELS = { pendiente: "🟡 Pendiente", pago_verificado: "🔵 Pago verificado", procesando: "🟣 En preparación", completado: "🟢 Completado", cancelado: "🔴 Cancelado" };
const STATUSES = Object.keys(LABELS);
function readOrders() { const rows = readJSON(FILE, []); return Array.isArray(rows) ? rows : []; }
function orderLine(o) { const ts = Math.floor(new Date(o.createdAt).getTime() / 1000); return "**#" + o.id + " · " + o.product + "** — " + o.price + "\nEstado: " + (LABELS[o.status] || o.status) + " · <t:" + ts + ":d>"; }
module.exports = {
  data: new SlashCommandBuilder().setName("pedido").setDescription("Crea pedidos y consulta su estado en FLUX STORE.")
    .addSubcommand(s => s.setName("crear").setDescription("Registra una solicitud de compra.")
      .addStringOption(o => o.setName("producto").setDescription("Producto que deseas comprar").setMinLength(2).setMaxLength(100).setRequired(true))
      .addStringOption(o => o.setName("precio").setDescription("Precio mostrado por la tienda").setMaxLength(40).setRequired(true))
      .addStringOption(o => o.setName("metodo").setDescription("Método de pago que usarás").setMaxLength(60).setRequired(true))
      .addStringOption(o => o.setName("detalles").setDescription("Información adicional").setMaxLength(500).setRequired(false)))
    .addSubcommand(s => s.setName("mis-compras").setDescription("Consulta tus últimos pedidos."))
    .addSubcommand(s => s.setName("historial").setDescription("Consulta el historial de un cliente (staff).").addUserOption(o => o.setName("cliente").setDescription("Cliente a consultar").setRequired(false)))
    .addSubcommand(s => s.setName("estado").setDescription("Actualiza el estado de un pedido (staff).")
      .addStringOption(o => o.setName("id").setDescription("ID del pedido").setMinLength(4).setMaxLength(12).setRequired(true))
      .addStringOption(o => o.setName("estado").setDescription("Nuevo estado").setRequired(true).addChoices(
        { name: "Pendiente", value: "pendiente" }, { name: "Pago verificado", value: "pago_verificado" },
        { name: "En preparación", value: "procesando" }, { name: "Completado", value: "completado" }, { name: "Cancelado", value: "cancelado" }))),
  async execute(i) {
    const action = i.options.getSubcommand(); const orders = readOrders();
    if (action === "crear") {
      const product = i.options.getString("producto").trim(); const price = i.options.getString("precio").trim(); const method = i.options.getString("metodo").trim(); const details = i.options.getString("detalles")?.trim() || "";
      if (!product || !price || !method) return i.reply({ content: "❌ Completa producto, precio y método.", ephemeral: true });
      const order = { id: randomUUID().split("-")[0].toUpperCase(), guildId: i.guildId, userId: i.user.id, userTag: i.user.tag, product, price, paymentMethod: method, details, status: "pendiente", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), statusHistory: [{ status: "pendiente", by: i.user.id, at: new Date().toISOString() }] };
      orders.push(order); writeJSON(FILE, orders.slice(-10000));
      const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle("🧾 Solicitud de pedido registrada").setDescription("**Pedido:** #" + order.id + "\n**Producto:** " + product + "\n**Precio indicado:** " + price + "\n**Método elegido:** " + method + "\n**Estado:** " + LABELS.pendiente + (details ? "\n**Detalles:** " + details : "")).setFooter({ text: "FLUX STORE • El pedido no se considera pagado hasta que el equipo verifique el pago." }).setTimestamp();
      return i.reply({ embeds: [embed], ephemeral: true });
    }
    if (action === "mis-compras") { const mine = orders.filter(o => o.guildId === i.guildId && o.userId === i.user.id).slice(-10).reverse(); if (!mine.length) return i.reply({ content: "Todavía no tienes pedidos. Usa /pedido crear.", ephemeral: true }); return i.reply({ embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle("🧾 Tus pedidos de FLUX STORE").setDescription(mine.map(orderLine).join("\n\n")).setFooter({ text: "Mostrando tus últimos 10 pedidos." })], ephemeral: true }); }
    if (!store.isStoreStaff(i.member)) return i.reply({ content: "❌ Solo el personal autorizado puede consultar historiales ajenos o cambiar estados.", ephemeral: true });
    if (action === "historial") { const target = i.options.getUser("cliente") || i.user; const rows = orders.filter(o => o.guildId === i.guildId && o.userId === target.id).slice(-15).reverse(); if (!rows.length) return i.reply({ content: "No hay pedidos registrados para ese cliente.", ephemeral: true }); return i.reply({ embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle("🧾 Historial de " + target.tag).setDescription(rows.map(orderLine).join("\n\n")).setFooter({ text: "FLUX STORE • Solo personal autorizado." })], ephemeral: true }); }
    const id = i.options.getString("id").trim().toUpperCase(); const order = orders.find(o => o.guildId === i.guildId && o.id === id); if (!order) return i.reply({ content: "❌ No encontré ese pedido.", ephemeral: true });
    const next = i.options.getString("estado"); if (!STATUSES.includes(next)) return i.reply({ content: "❌ Estado no válido.", ephemeral: true });
    if (order.status === "cancelado" && next !== "cancelado") return i.reply({ content: "❌ Un pedido cancelado no se puede reactivar desde este comando.", ephemeral: true });
    if (next === "completado" && !["pago_verificado", "procesando"].includes(order.status)) return i.reply({ content: "❌ Verifica el pago y prepara el pedido antes de completarlo.", ephemeral: true });
    const now = new Date().toISOString(); order.status = next; order.updatedAt = now; order.statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : []; order.statusHistory.push({ status: next, by: i.user.id, at: now }); writeJSON(FILE, orders);
    const embed = new EmbedBuilder().setColor(config.colors.success).setTitle("✅ Estado actualizado").setDescription("**Pedido:** #" + order.id + "\n**Cliente:** <@" + order.userId + ">\n**Producto:** " + order.product + "\n**Estado:** " + LABELS[next] + "\n**Actualizado por:** <@" + i.user.id + ">").setTimestamp();
    return i.reply({ embeds: [embed], ephemeral: true });
  }
}
