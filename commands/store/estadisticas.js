const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");
const store = require("../../store-service");
const orders = require("../../services/order-service");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("estadisticas")
    .setDescription("Estadísticas internas de pedidos y ventas de FLUX STORE."),
  async execute(interaction) {
    if (!store.isStoreStaff(interaction.member)) {
      return interaction.reply({ content: "❌ Estas estadísticas son solo para el equipo autorizado.", ephemeral: true });
    }
    const stats = orders.getStatistics(interaction.guildId);
    const products = store.getProducts();
    const completed = stats.counts.completado || 0;
    const fields = [
      { name: "🛍️ Productos en catálogo", value: String(products.length), inline: true },
      { name: "🧾 Pedidos registrados", value: String(stats.total), inline: true },
      { name: "🟡 Pendientes", value: String(stats.counts.pendiente || 0), inline: true },
      { name: "🔵 Pago verificado", value: String(stats.counts.pago_verificado || 0), inline: true },
      { name: "🟣 Procesando", value: String(stats.counts.procesando || 0), inline: true },
      { name: "🟢 Completados", value: String(completed), inline: true },
      { name: "🔴 Cancelados", value: String(stats.counts.cancelado || 0), inline: true },
      { name: "🧮 Contador de ventas", value: String(store.getStats().sales), inline: true }
    ];
    const revenueLines = Object.entries(stats.revenue).map(([currency, amount]) => currency + ": " + orders.formatMoney(amount, currency));
    fields.push({
      name: "💰 Ingresos de pedidos completados",
      value: revenueLines.length ? revenueLines.join("\n").slice(0, 1024) : "Aún no hay ingresos calculables. Los precios del catálogo deben incluir una cantidad numérica.",
      inline: false
    });
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle("📊 Estadísticas • FLUX STORE")
        .addFields(fields).setFooter({ text: "Los ingresos se calculan solo a partir de pedidos completados; no son una confirmación bancaria." })
        .setTimestamp()],
      ephemeral: true
    });
  }
};
