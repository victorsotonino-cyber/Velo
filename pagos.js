const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");

module.exports = {
  data: new SlashCommandBuilder().setName("pagos").setDescription("Muestra los métodos de pago aceptados por FLUX STORE."),
  async execute(i) {
    const methods = Array.isArray(config.store.paymentMethods) ? config.store.paymentMethods : [];
    const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle("💳 Métodos de pago · FLUX STORE")
      .setDescription(methods.length ? methods.map((method, index) => (index + 1) + ". **" + method + "**").join("\n") : "El equipo todavía no configuró métodos de pago.")
      .setFooter({ text: "Verifica siempre el destinatario y el importe antes de realizar un pago." });
    if (config.store.paymentInstructions) {
      embed.addFields({ name: "Instrucciones", value: config.store.paymentInstructions.slice(0, 1024) });
    } else {
      embed.addFields({ name: "¿Necesitas los datos para pagar?", value: "Abre un ticket de compras para recibir instrucciones del equipo." });
    }
    return i.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
