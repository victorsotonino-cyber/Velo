"use strict";

const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
const store = require("./store-service");
const commerce = require("./commerce-service");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("estadisticas-tienda")
    .setDescription("Muestra indicadores de pedidos y productos de FLUX STORE."),
  async execute(i) {
    if (!i.guildId) return i.reply({ content: "Este comando solo funciona en un servidor.", ephemeral: true });

    const stats = commerce.getOrderStats(i.guildId);
    const legacy = store.getStats();
    const products = store.getProducts();
    const activeProducts = products.filter(function (p) {
      return p.enabled !== false && p.active !== false &&
        (!Object.prototype.hasOwnProperty.call(p, "stock") || Number(p.stock) > 0);
    }).length;

    const fields = [
      { name: "Pedidos registrados", value: String(stats.total), inline: true },
      { name: "Completados", value: String(stats.completed), inline: true },
      { name: "Pendientes", value: String(stats.pending), inline: true },
      { name: "Cancelados", value: String(stats.cancelled), inline: true },
      { name: "Productos disponibles", value: String(activeProducts) + " / " + products.length, inline: true },
      { name: "Contador histórico de ventas", value: String(legacy.sales), inline: true }
    ];

    if (store.isStoreStaff(i.member)) {
      fields.push({
        name: "Ingresos de pedidos completados",
        value: "**" + commerce.money(stats.revenueCents, stats.currency) + "**",
        inline: false
      });
    }

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle("📊 FLUX STORE • Estadísticas de tienda")
      .setDescription("Los ingresos se calculan solo con pedidos marcados como completados. El contador histórico puede incluir ventas registradas por vouch.")
      .addFields(fields)
      .setFooter({ text: "Estadísticas del servidor actual • Datos guardados por el bot" })
      .setTimestamp();

    return i.reply({ embeds: [embed], ephemeral: !store.isStoreStaff(i.member) });
  }
};
