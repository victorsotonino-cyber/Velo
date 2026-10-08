const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("./config");
const { emoji } = require("./ui");
const { readJSON, writeJSON } = require("./storage");

const DEFAULT_QUESTIONS = [
  "¿Cuál es tu nick o nombre con el que te conocen?",
  "¿Qué edad tienes?",
  "¿Por qué quieres ser Staff de Velo Studio?",
  "¿Qué sabes hacer? Cuéntanos tus habilidades y experiencia.",
  "¿A qué puesto te gustaría postularte: Developer, Configurador, Diseñador o Staff?",
  "¿En qué servidores has trabajado anteriormente?",
  "¿Qué lenguajes de programación conoces y cuál dominas mejor?",
  "Menciona 2 plugins que conozcas y explica brevemente para qué sirven.",
  "¿Qué experiencia tienes trabajando en servidores o comunidades?",
  "¿Por qué deberíamos aceptarte?",
  "¿Hay algo más que quieras agregar?"
];

function load() {
  const data = readJSON("postulaciones.json", { questions: DEFAULT_QUESTIONS });
  const questions = Array.isArray(data.questions) ? data.questions.filter(q => typeof q === "string" && q.trim()).slice(0, 25) : [];
  return { questions: questions.length ? questions : [...DEFAULT_QUESTIONS] };
}

function save(data) {
  writeJSON("postulaciones.json", { questions: data.questions.slice(0, 25), updatedAt: new Date().toISOString() });
}

function listText(questions) {
  return questions.map((q, n) => "**" + (n + 1) + ".** " + q).join("\n") || "Sin preguntas configuradas.";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("postulaciones-config")
    .setDescription("Configura las preguntas del sistema de postulaciones.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName("agregar").setDescription("Agrega una pregunta al final.").addStringOption(o => o.setName("pregunta").setDescription("Nueva pregunta").setRequired(true).setMaxLength(500)))
    .addSubcommand(s => s.setName("eliminar").setDescription("Elimina una pregunta.").addIntegerOption(o => o.setName("numero").setDescription("Número").setRequired(true).setMinValue(1).setMaxValue(25)))
    .addSubcommand(s => s.setName("ver").setDescription("Muestra las preguntas actuales."))
    .addSubcommand(s => s.setName("restablecer").setDescription("Restablece las preguntas oficiales.")),

  async execute(i) {
    const data = load();
    const sub = i.options.getSubcommand();

    if (sub === "agregar") {
      if (data.questions.length >= 25) return i.reply({ content: emoji(i.guild, "error", "❌") + " Máximo **25 preguntas**.", ephemeral: true });
      data.questions.push(i.options.getString("pregunta", true).trim());
      save(data);
      return i.reply(emoji(i.guild, "success", "✅") + " Pregunta agregada como **#" + data.questions.length + "**.");
    }

    if (sub === "eliminar") {
      const n = i.options.getInteger("numero", true);
      if (n > data.questions.length) return i.reply({ content: emoji(i.guild, "error", "❌") + " No existe la pregunta **#" + n + "**.", ephemeral: true });
      const removed = data.questions.splice(n - 1, 1)[0];
      save(data);
      return i.reply(emoji(i.guild, "trash", "🗑️") + " Pregunta eliminada: **" + removed + "**");
    }

    if (sub === "restablecer") {
      save({ questions: [...DEFAULT_QUESTIONS] });
      return i.reply(emoji(i.guild, "success", "✅") + " Preguntas restablecidas.");
    }

    return i.reply({
      embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle(emoji(i.guild, "settings", "⚙️") + " Preguntas de postulación").setDescription(listText(data.questions)).setFooter({ text: "Velo Studio • /postulaciones-config" })],
      ephemeral: true
    });
  }
};
