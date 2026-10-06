const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
const { emoji } = require("./ui");

function cleanInput(text) {
  return text
    .replace(/^(hazme|haz|crea|genera|generame|générame|escribe)\\s+(un\\s+)?anuncio\\s*(de|sobre)?\\s*/i, "")
    .trim();
}

function inferType(text) {
  const t = text.toLowerCase();
  if (/compr|venta|precio|oferta|tienda|producto|stock|descuento/.test(t)) return "venta";
  if (/evento|reunion|reunión|torneo|sorteo|giveaway|actividad/.test(t)) return "evento";
  if (/actualiz|update|nuevo|nueva|cambio|mejora/.test(t)) return "actualizacion";
  if (/regla|norma|aviso|importante|atencion|atención|mantenimiento/.test(t)) return "aviso";
  return "general";
}

function generate(text, title, type) {
  const subject = cleanInput(text);
  const kind = type === "automatico" ? inferType(subject) : type;
  const titles = {
    general: "📢 Nuevo anuncio",
    venta: "🛒 Nuevo anuncio de tienda",
    evento: "🎉 Nuevo evento",
    actualizacion: "🚀 Nueva actualización",
    aviso: "⚠️ Aviso importante"
  };
  const finalTitle = title?.trim() || titles[kind];

  const openers = {
    general: "Tenemos una novedad para toda la comunidad de Velo Studio.",
    venta: "¡Tenemos novedades para quienes están buscando productos o servicios!",
    evento: "¡Prepárate! Tenemos una actividad especial para la comunidad.",
    actualizacion: "Velo Studio sigue mejorando y queremos contarte qué hay de nuevo.",
    aviso: "Queremos que toda la comunidad esté al tanto de esta información."
  };

  const closers = {
    general: "Mantente atento a los próximos anuncios para no perderte nada.",
    venta: "Si te interesa, abre un ticket y te ayudaremos con cualquier duda.",
    evento: "Guarda la fecha y participa con la comunidad.",
    actualizacion: "Gracias por seguir formando parte de Velo Studio.",
    aviso: "Gracias por leer y por ayudarnos a mantener Velo Studio organizado."
  };

  const result = [
    openers[kind],
    "",
    "📌 **Información:** " + subject,
    "",
    closers[kind]
  ].join("\n");

  const summary = subject.length > 300 ? subject.slice(0, 297) + "..." : subject;
  return { finalTitle, result, summary };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("anuncio")
    .setDescription("Genera automáticamente un anuncio listo para publicar.")
    .addStringOption(o =>
      o.setName("texto")
        .setDescription("Escribe qué quieres anunciar, por ejemplo: hazme un anuncio de una nueva oferta")
        .setRequired(true)
        .setMaxLength(1000)
    )
    .addStringOption(o =>
      o.setName("titulo")
        .setDescription("Título opcional del anuncio")
        .setRequired(false)
        .setMaxLength(100)
    )
    .addStringOption(o =>
      o.setName("tipo")
        .setDescription("La IA puede detectarlo automáticamente")
        .setRequired(false)
        .addChoices(
          { name: "Automático", value: "automatico" },
          { name: "General", value: "general" },
          { name: "Venta", value: "venta" },
          { name: "Evento", value: "evento" },
          { name: "Actualización", value: "actualizacion" },
          { name: "Aviso", value: "aviso" }
        )
    ),

  async execute(i) {
    const text = i.options.getString("texto");
    const title = i.options.getString("titulo");
    const type = i.options.getString("tipo") || "automatico";
    const generated = generate(text, title, type);
    const ann = emoji(i.guild, "announcement", "📢");
    const info = emoji(i.guild, "info", "📌");
    const bot = emoji(i.guild, "bot", "🤖");

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(ann + " " + generated.finalTitle.replace(/^[^ ]+\\s*/, ""))
      .setDescription(generated.result)
      .addFields({
        name: info + " Resumen",
        value: generated.summary
      })
      .setFooter({ text: "Generado automáticamente por Velo Studio " + bot })
      .setTimestamp();

    return i.reply({ embeds: [embed] });
  }
};
