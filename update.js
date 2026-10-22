const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");

const updates = [
  "**👋 Bienvenida renovada** — mensaje visual de FLUX STORE con enlaces directos a términos, métodos y tickets.",
  "**🎭 Autorol automático** — los nuevos miembros reciben el rol configurado al entrar.",
  "**🧪 Vista previa** — usa `!test-bienvenida` o `!bienvenida-test` para revisar el diseño sin simular una entrada.",
  "**🛍️ Catálogo de tienda** — consulta productos y administra precios/descripciones con `/tienda`.",
  "**🎟️ Atención al cliente** — panel de tickets con categorías de compras, dudas, reportes, partner y alianzas.",
  "**🎉 Sorteos** — creación, participación, finalización y selección de ganadores con el sistema de giveaways.",
  "**🛡️ Moderación y utilidad** — herramientas de administración, ayuda, actividad, encuestas y estado del bot."
];

function buildUpdateEmbed() {
  return new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setAuthor({ name: "FLUX STORE • SYSTEM UPDATE" })
    .setTitle("✦ Novedades del bot")
    .setDescription(updates.join("\n\n"))
    .addFields({
      name: "⚙️ Activación",
      value: "Los cambios del código se publican en GitHub. Para que estén activos en Discord, el hosting debe actualizar el repositorio y reiniciar el bot."
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
