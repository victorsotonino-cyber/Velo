const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
const orderService = require("./order-service");
const { readJSON, writeJSON } = require("./storage");

const FILE = "flux-store-reviews.json";

function readReviews() {
  const value = readJSON(FILE, []);
  return Array.isArray(value) ? value : [];
}

function orderHasProduct(order, name) {
  const wanted = String(name || "").trim().toLowerCase();
  if (!wanted) return false;
  if (Array.isArray(order.items) && order.items.length) {
    return order.items.some(item => String(item.productName || item.name || "").trim().toLowerCase() === wanted);
  }
  return String(order.product || "").trim().toLowerCase() === wanted;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("resena")
    .setDescription("Publica una reseña de un producto que hayas comprado.")
    .addStringOption(o => o.setName("producto").setDescription("Nombre del producto del pedido completado").setMinLength(2).setMaxLength(100).setRequired(true))
    .addIntegerOption(o => o.setName("estrellas").setDescription("Puntuación de 1 a 5 estrellas").setMinValue(1).setMaxValue(5).setRequired(true))
    .addStringOption(o => o.setName("comentario").setDescription("Tu opinión sobre la compra").setMinLength(5).setMaxLength(500).setRequired(true)),
  async execute(i) {
    if (!i.guildId) return i.reply({ content: "Este comando solo funciona dentro de un servidor.", ephemeral: true });
    const productName = i.options.getString("producto").trim();
    const stars = i.options.getInteger("estrellas");
    const comment = i.options.getString("comentario").trim();
    const orders = orderService.readOrders().filter(order =>
      order.guildId === i.guildId &&
      order.userId === i.user.id &&
      order.status === "completado" &&
      orderHasProduct(order, productName)
    ).sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));

    if (!orders.length) {
      return i.reply({ content: "Solo puedes reseñar un producto que figure en uno de tus pedidos completados. Revisa el nombre del producto y el estado con /pedido mis-compras.", ephemeral: true });
    }

    const reviews = readReviews();
    const order = orders.find(candidate => !reviews.some(review =>
      review.guildId === i.guildId && review.userId === i.user.id && review.orderId === candidate.id
    ));
    if (!order) return i.reply({ content: "Ya dejaste una reseña para cada pedido completado de ese producto.", ephemeral: true });

    const verifiedProduct = Array.isArray(order.items) && order.items.length
      ? (order.items.find(item => String(item.productName || item.name || "").trim().toLowerCase() === productName.toLowerCase())?.productName || productName)
      : String(order.product || productName).slice(0, 100);
    const review = {
      id: Date.now().toString(36).toUpperCase(),
      guildId: i.guildId,
      userId: i.user.id,
      userTag: i.user.tag,
      productName: verifiedProduct,
      orderId: order.id,
      stars,
      comment,
      createdAt: new Date().toISOString()
    };
    reviews.push(review);
    writeJSON(FILE, reviews.slice(-10000));

    const embed = new EmbedBuilder().setColor(config.colors.success).setTitle("⭐ Reseña verificada · " + verifiedProduct.slice(0, 180))
      .setDescription("**Valoración:** " + "⭐".repeat(stars) + " (" + stars + "/5)\n\n" + comment)
      .addFields({ name: "Compra verificada", value: "Pedido #" + order.id, inline: true })
      .setFooter({ text: "FLUX STORE • Reseña enviada por " + i.user.tag })
      .setTimestamp(new Date(review.createdAt));

    let posted = false;
    if (config.channels.reviews) {
      const channel = await i.guild.channels.fetch(config.channels.reviews).catch(() => null);
      if (channel?.isTextBased()) {
        await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).then(() => { posted = true; }).catch(error => {
          console.error("No se pudo publicar una reseña:", error.message);
        });
      }
    }
    return i.reply({
      content: posted ? "✅ Gracias. Tu reseña quedó registrada y publicada en el canal de reseñas." :
        "✅ Tu reseña quedó registrada para el pedido #" + order.id + ". Para publicarla automáticamente, configura REVIEWS_CHANNEL_ID.",
      ephemeral: true,
      allowedMentions: { parse: [] }
    });
  }
};
