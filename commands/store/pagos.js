const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("../../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("pagos")
    .setDescription("Muestra los métodos e instrucciones de pago de FLUX STORE."),
  async execute(interaction) {
    const text = String(config.paymentMethodsText || "").trim();
    if (!text) {
      return interaction.reply({
        content: "ℹ️ Los métodos de pago todavía no están configurados. Abre un ticket de Compras y pedidos para recibir las instrucciones oficiales.",
        ephemeral: true
      });
    }
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle("💳 Métodos de pago • FLUX STORE")
      .setDescription(text.slice(0, 4000))
      .setFooter({ text: "Comprueba los datos y el importe antes de pagar. El pedido solo se marcará como pagado cuando el equipo lo verifique." });
    return interaction.reply({ embeds: [embed], ephemeral: true, allowedMentions: { parse: [] } });
  }
};
