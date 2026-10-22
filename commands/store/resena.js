const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");
const { readJSON, writeJSON } = require("../../storage");
const orderService = require("../../services/order-service");

const FILE = "flux-store-reviews.json";

function readReviews() {
  const value = readJSON(FILE, []);
  return Array.isArray(value) ? value : [];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("resena")
    .setDescription("Publica y consulta reseñas verificadas de FLUX STORE.")
    .addSubcommand(sub => sub.setName("publicar").setDescription("Deja una reseña de una compra completada.")
      .addStringOption(option => option.setName("pedido").setDescription("ID del pedido completado").setMinLength(4).setMaxLength(12).setRequired(true))
      .addIntegerOption(option => option.setName("estrellas").setDescription("Tu puntuación").setMinValue(1).setMaxValue(5).setRequired(true))
      .addStringOption(option => option.setName("comentario").setDescription("Tu opinión sobre la compra").setMinLength(5).setMaxLength(700).setRequired(true)))
    .addSubcommand(sub => sub.setName("listar").setDescription("Consulta las últimas reseñas.")
      .addStringOption(option => option.setName("producto").setDescription("Filtra por nombre de producto").setMaxLength(80).setRequired(false))),
  async execute(interaction) {
    const action = interaction.options.getSubcommand();
    const rows = readReviews();

    if (action === "publicar") {
      const orderId = interaction.options.getString("pedido").trim().toUpperCase();
      if (!orderService.hasCompletedOrder(interaction.guildId, interaction.user.id, orderId)) {
        return interaction.reply({
          content: "❌ Solo puedes reseñar un pedido tuyo que esté marcado como completado. Comprueba el ID con /pedido mis-compras.",
          ephemeral: true
        });
      }
      if (rows.some(review => review.guildId === interaction.guildId && review.orderId === orderId)) {
        return interaction.reply({ content: "❌ Ya existe una reseña para ese pedido.", ephemeral: true });
      }

      const order = orderService.getOrderById(interaction.guildId, orderId);
      const review = {
        id: String(Date.now()) + "-" + interaction.user.id,
        guildId: interaction.guildId,
        orderId,
        userId: interaction.user.id,
        product: order.product,
        rating: interaction.options.getInteger("estrellas"),
        comment: interaction.options.getString("comentario").trim(),
        createdAt: new Date().toISOString()
      };
      rows.push(review);
      writeJSON(FILE, rows.slice(-10000));

      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle("⭐ Reseña verificada • FLUX STORE")
        .setDescription("**Producto:** " + review.product + "\n**Puntuación:** " + "⭐".repeat(review.rating) + " (" + review.rating + "/5)\n**Comentario:** " + review.comment)
        .addFields({ name: "Compra verificada", value: "Pedido #" + orderId, inline: true })
        .setFooter({ text: "Reseña de una compra completada • FLUX STORE" })
        .setTimestamp(new Date(review.createdAt));
      const destination = interaction.guild.channels.cache.get(config.channels.reviews);
      const channel = destination?.isTextBased() ? destination : interaction.channel;
      await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      return interaction.reply({ content: "✅ Gracias. Tu reseña verificada se ha publicado en " + channel + ".", ephemeral: true });
    }

    const productFilter = (interaction.options.getString("producto") || "").trim().toLowerCase();
    const selected = rows.filter(review => review.guildId === interaction.guildId &&
      (!productFilter || String(review.product || "").toLowerCase().includes(productFilter)))
      .slice(-10).reverse();
    if (!selected.length) {
      return interaction.reply({ content: "Todavía no hay reseñas para ese filtro.", ephemeral: true });
    }
    const description = selected.map(review =>
      "⭐".repeat(Math.max(1, Math.min(5, Number(review.rating) || 1))) +
      " **" + review.product + "** · " + review.rating + "/5\n" +
      String(review.comment || "").slice(0, 450) + "\nPedido verificado #" + review.orderId
    ).join("\n\n").slice(0, 4000);
    return interaction.reply({
      embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle("⭐ Reseñas verificadas • FLUX STORE")
        .setDescription(description).setFooter({ text: "Últimas 10 reseñas • Publicadas tras compras completadas." })],
      ephemeral: true
    });
  }
};
