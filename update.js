const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const updates = [
  "**🛒 Carrito de compras** — agrega varios productos, ajusta cantidades, revisa subtotales y crea pedidos desde el carrito.",
  "**📦 Pedidos más seguros** — el precio sale del catálogo; los pedidos registran el método de pago y avanzan por estados controlados.",
  "**📊 Stock e inventario** — configura stock limitado o ilimitado, reserva unidades al crear pedidos y devuelve unidades al cancelar.",
  "**🎟️ Cupones integrados** — descuentos, caducidad, límite de usos y aislamiento por servidor.",
  "**⭐ Reseñas verificadas** — solo pueden publicarse reseñas asociadas a pedidos propios completados.",
  "**📈 Estadísticas** — resumen de pedidos, estados e ingresos calculados de pedidos completados para el equipo autorizado.",
  "**💡 Comunidad** — sugerencias votables, encuestas interactivas y /userinfo.",
  "**🛡️ Automod básico** — detección de spam repetitivo y bloqueo de invitaciones opcional mediante variables de entorno.",
  "**🧭 Comandos organizados** — el cargador y el registro slash aceptan comandos en subcarpetas.",
  "**🔐 Configuración externa** — tokens, canales, roles y emojis personalizados se leen desde variables de entorno, no desde el código.",
  "**🧪 Pruebas automatizadas** — validación de pedidos, stock, cupones y esquemas slash mediante npm test y GitHub Actions."
];

function buildUpdateEmbed() {
  return new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setAuthor({ name: "FLUX STORE • SYSTEM UPDATE" })
    .setTitle("✦ Novedades del bot")
    .setDescription(updates.join("\n\n"))
    .addFields({
      name: "⚙️ Activación",
      value: "Estos cambios están en la rama de mejora de GitHub. Antes de activarlos en el hosting, configura sus variables de entorno y verifica la rama que vas a desplegar."
    })
    .setFooter({ text: "FLUX STORE • Registro de actualizaciones" })
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("update")
    .setDescription("Muestra las últimas mejoras de FLUX STORE."),
  async execute(interaction) {
    await interaction.reply({ embeds: [buildUpdateEmbed()] });
  },
  buildUpdateEmbed
};
