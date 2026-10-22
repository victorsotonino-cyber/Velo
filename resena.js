"use strict";

const { randomUUID } = require("crypto");
const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require("discord.js");
const config = require("./config");
const { readJSON, writeJSON } = require("./storage");
const commerce = require("./commerce-service");

const FILE = "flux-store-reviews.json";

function readReviews() {
  const data = readJSON(FILE, []);
  return Array.isArray(data) ? data : [];
}

function reviewEmbed(review) {
  return new EmbedBuilder()
    .setColor(review.rating >= 4 ? config.colors.success : review.rating === 3 ? config.colors.warning : config.colors.error)
    .setTitle("⭐ Reseña verificada de FLUX STORE")
    .setDescription("**Producto:** " + review.product.slice(0, 200) + "\n" +
      "⭐".repeat(review.rating) + " (" + review.rating + "/5)\n\n" + review.comment.slice(0, 1200))
    .setFooter({ text: "Pedido #" + review.orderId + " • Cliente verificado" })
    .setTimestamp(new Date(review.createdAt));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("resena")
    .setDescription("Publica y consulta reseñas verificadas de FLUX STORE.")
    .addSubcommand(function (s) {
      return s.setName("publicar").setDescription("Valora un pedido que ya esté completado.")
        .addStringOption(function (o) {
          return o.setName("pedido").setDescription("Identificador del pedido completado")
            .setMinLength(4).setMaxLength(12).setRequired(true);
        })
        .addIntegerOption(function (o) {
          return o.setName("puntuacion").setDescription("Tu puntuación del 1 al 5")
            .setMinValue(1).setMaxValue(5).setRequired(true);
        })
        .addStringOption(function (o) {
          return o.setName("comentario").setDescription("Cuéntanos cómo fue tu experiencia")
            .setMinLength(5).setMaxLength(1200).setRequired(true);
        });
    })
    .addSubcommand(function (s) {
      return s.setName("ver").setDescription("Consulta las reseñas verificadas.")
        .addStringOption(function (o) {
          return o.setName("producto").setDescription("Filtro opcional por nombre de producto")
            .setMaxLength(80).setRequired(false);
        });
    }),
  async execute(i) {
    if (!i.guildId) return i.reply({ content: "Este comando solo funciona dentro del servidor.", ephemeral: true });

    const reviews = readReviews();
    const action = i.options.getSubcommand();

    if (action === "publicar") {
      const orderId = i.options.getString("pedido").trim().toUpperCase();
      const orders = commerce.getOrders();
      const order = orders.find(function (row) {
        return row.guildId === i.guildId && row.userId === i.user.id &&
          String(row.id).toUpperCase() === orderId;
      });

      if (!order) {
        return i.reply({ content: "❌ No encontré ese pedido en tu historial.", ephemeral: true });
      }
      if (order.status !== "completado") {
        return i.reply({ content: "❌ Solo puedes reseñar pedidos que el equipo haya marcado como completados.", ephemeral: true });
      }
      if (reviews.some(function (review) { return review.orderId === order.id; })) {
        return i.reply({ content: "❌ Ese pedido ya tiene una reseña registrada.", ephemeral: true });
      }

      const review = {
        id: randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase(),
        guildId: i.guildId,
        userId: i.user.id,
        userTag: i.user.tag,
        orderId: order.id,
        product: String(order.product || (Array.isArray(order.items) ? order.items.map(function (item) {
          return item.productName + " x" + item.quantity;
        }).join(", ") : "Producto")).slice(0, 200),
        rating: i.options.getInteger("puntuacion"),
        comment: i.options.getString("comentario").trim(),
        createdAt: new Date().toISOString()
      };
      reviews.push(review);
      writeJSON(FILE, reviews.slice(-5000));

      const channelId = config.channels.reviews;
      let posted = false;
      if (channelId) {
        const channel = await i.guild.channels.fetch(channelId).catch(function () { return null; });
        if (channel && channel.type === ChannelType.GuildText) {
          await channel.send({ embeds: [reviewEmbed(review)], allowedMentions: { parse: [] } })
            .then(function () { posted = true; })
            .catch(function (error) { console.error("No se pudo publicar la reseña:", error.message); });
        }
      }

      return i.reply({
        content: "✅ Reseña registrada. " + (posted ? "Gracias por compartir tu experiencia." : "Guárdala como verificada; el canal público de reseñas aún no está configurado."),
        embeds: [reviewEmbed(review)],
        ephemeral: true
      });
    }

    const productFilter = String(i.options.getString("producto") || "").trim().toLowerCase();
    const filtered = reviews.filter(function (review) {
      return review.guildId === i.guildId &&
        (!productFilter || String(review.product || "").toLowerCase().includes(productFilter));
    }).slice(-10).reverse();

    if (!filtered.length) {
      return i.reply({ content: "Todavía no hay reseñas verificadas que coincidan con ese filtro.", ephemeral: true });
    }

    const avg = filtered.reduce(function (sum, review) { return sum + Number(review.rating || 0); }, 0) / filtered.length;
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle("⭐ Reseñas verificadas de FLUX STORE")
      .setDescription(filtered.map(function (review) {
        return "**" + review.product.slice(0, 100) + "** · " + "⭐".repeat(review.rating) +
          " (" + review.rating + "/5)\n" + review.comment.slice(0, 220) +
          "\n_Pedido #" + review.orderId + " • " + new Date(review.createdAt).toLocaleDateString("es-ES") + "_";
      }).join("\n\n").slice(0, 4000))
      .setFooter({ text: filtered.length + " reseñas mostradas • Media de esta vista: " + avg.toFixed(1) + "/5" });

    return i.reply({ embeds: [embed], ephemeral: true });
  }
};
