const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
const store = require("./store-service");
const orderService = require("./order-service");

const CURRENCY = String(process.env.STORE_CURRENCY || "USD").trim().slice(0, 10);
function money(amount) { return Number(amount).toFixed(2) + " " + CURRENCY; }

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ventas")
    .setDescription("Consulta el contador y las estadísticas de FLUX STORE.")
    .addSubcommand(s => s.setName("ver").setDescription("Muestra los contadores de la tienda."))
    .addSubcommand(s => s.setName("estadisticas").setDescription("Métricas de pedidos, ingresos y productos (staff)."))
    .addSubcommand(s => s.setName("sumar").setDescription("Añade ventas al contador manual.")
      .addIntegerOption(o => o.setName("cantidad").setDescription("Cantidad que quieres añadir, por defecto 1").setMinValue(1).setMaxValue(10000).setRequired(false)))
    .addSubcommand(s => s.setName("establecer").setDescription("Ajusta el contador manual al total correcto.")
      .addIntegerOption(o => o.setName("cantidad").setDescription("Nuevo total de ventas").setMinValue(0).setMaxValue(100000000).setRequired(true))),
  async execute(i) {
    const action = i.options.getSubcommand();
    if (action === "ver") {
      const stats = store.getStats();
      const embed = new EmbedBuilder().setColor(config.colors.primary)
        .setTitle("✦ Resumen de FLUX STORE ✦")
        .setDescription("🛒 **Ventas registradas manualmente:** **" + stats.sales + "**\n✅ **Verificaciones legit:** **" + stats.legit + "**")
        .setFooter({ text: "Los contadores manuales pueden diferir de los pedidos registrados." });
      return i.reply({ embeds: [embed], ephemeral: true });
    }

    if (!store.isStoreStaff(i.member)) {
      return i.reply({ content: "❌ Solo el personal autorizado puede consultar ingresos o cambiar contadores.", ephemeral: true });
    }

    if (action === "estadisticas") {
      const orders = orderService.readOrders().filter(order => order.guildId === i.guildId);
      const completed = orders.filter(order => order.status === "completado");
      const pending = orders.filter(order => order.status === "pendiente" || order.status === "pago_verificado" || order.status === "procesando");
      const cancelled = orders.filter(order => order.status === "cancelado");
      const revenue = completed.reduce((sum, order) => {
        const amount = Number(order.totalAmount);
        return order.totalAmount !== null && order.totalAmount !== undefined && Number.isFinite(amount) && amount >= 0
          ? sum + amount : sum;
      }, 0);
      const revenueOrders = completed.filter(order => order.totalAmount !== null && order.totalAmount !== undefined && Number.isFinite(Number(order.totalAmount))).length;
      const productCounts = new Map();
      for (const order of completed) {
        const items = Array.isArray(order.items) ? order.items : [];
        if (!items.length && order.product) {
          const name = String(order.product).slice(0, 100);
          productCounts.set(name, (productCounts.get(name) || 0) + 1);
        }
        for (const item of items) {
          const name = String(item.productName || item.name || "Producto").slice(0, 100);
          const count = Math.max(1, Math.floor(Number(item.quantity) || 1));
          productCounts.set(name, (productCounts.get(name) || 0) + count);
        }
      }
      const best = [...productCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      const topText = best.length ? best.map(([name, count], index) => (index + 1) + ". **" + name + "** — " + count + " uds.").join("\n") : "Todavía no hay ventas completadas registradas.";
      const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle("📊 Estadísticas de ventas · FLUX STORE")
        .addFields(
          { name: "Pedidos totales", value: String(orders.length), inline: true },
          { name: "Completados", value: String(completed.length), inline: true },
          { name: "Pendientes / en curso", value: String(pending.length), inline: true },
          { name: "Cancelados", value: String(cancelled.length), inline: true },
          { name: "Ingresos calculables", value: money(revenue), inline: true },
          { name: "Pedidos con importe", value: String(revenueOrders), inline: true },
          { name: "Productos más vendidos", value: topText.slice(0, 1024), inline: false }
        )
        .setFooter({ text: "Los ingresos suman solo importes guardados en pedidos completados; no son una conciliación de pagos." })
        .setTimestamp();
      return i.reply({ embeds: [embed], ephemeral: true, allowedMentions: { parse: [] } });
    }

    const stats = action === "sumar"
      ? store.addSales(i.options.getInteger("cantidad") || 1)
      : store.setSales(i.options.getInteger("cantidad"));
    await store.refreshCounters(i.guild);
    return i.reply({ content: "✅ Contador actualizado: **" + stats.sales + " ventas**.", ephemeral: true });
  }
};
