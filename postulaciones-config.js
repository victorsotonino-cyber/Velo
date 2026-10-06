const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("./config");
const { emoji } = require("./ui");
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "postulaciones.json");

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
  "¿Por qué deberíamos aceptarte a ti y no a otra persona?",
  "¿Hay algo más que quieras agregar o que debamos saber?"
];

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return { questions: Array.isArray(data.questions) ? data.questions : [] };
  } catch {
    return { questions: [...DEFAULT_QUESTIONS] };
  }
}

function save(data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

function listText(questions) {
  return questions.map((q, n) => "**" + (n + 1) + ".** " + q).join("\n") || "Sin preguntas configuradas.";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("postulaciones-config")
    .setDescription("Configura las preguntas del sistema de postulaciones.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s =>
      s.setName("agregar")
        .setDescription("Agrega una pregunta al final.")
        .addStringOption(o =>
          o.setName("pregunta")
            .setDescription("Escribe la nueva pregunta.")
            .setRequired(true)
            .setMaxLength(500)
        )
    )
    .addSubcommand(s =>
      s.setName("eliminar")
        .setDescription("Elimina una pregunta por número.")
        .addIntegerOption(o =>
          o.setName("numero")
            .setDescription("Número de la pregunta.")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(25)
        )
    )
    .addSubcommand(s =>
      s.setName("ver")
        .setDescription("Muestra todas las preguntas actuales.")
    )
    .addSubcommand(s =>
      s.setName("restablecer")
        .setDescription("Restablece las preguntas oficiales de Velo Studio.")
    ),

  async execute(i) {
    const data = load();
    const sub = i.options.getSubcommand();

    if (sub === "agregar") {
      const question = i.options.getString("pregunta", true).trim();

      if (data.questions.length >= 25) {
        return i.reply({
          content: emoji(i.guild, "error", "❌") + " Discord permite un máximo de **25 preguntas**.",
          ephemeral: true
        });
      }

      data.questions.push(question);
      save(data);

      return i.reply(
        emoji(i.guild, "success", "✅") +
        " Pregunta agregada como **#" + data.questions.length + "**."
      );
    }

    if (sub === "eliminar") {
      const number = i.options.getInteger("numero", true);

      if (number > data.questions.length) {
        return i.reply({
          content: emoji(i.guild, "error", "❌") + " No existe la pregunta **#" + number + "**.",
          ephemeral: true
        });
      }

      const removed = data.questions.splice(number - 1, 1)[0];
      save(data);

      return i.reply(
        emoji(i.guild, "trash", "🗑️") +
        " Se eliminó la pregunta **#" + number + "**: " + removed
      );
    }

    if (sub === "restablecer") {
      save({ questions: [...DEFAULT_QUESTIONS] });

      return i.reply(
        emoji(i.guild, "success", "✅") +
        " Preguntas restablecidas. Ahora hay **" + DEFAULT_QUESTIONS.length + "**."
      );
    }

    return i.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle(emoji(i.guild, "settings", "⚙️") + " Preguntas de postulación")
          .setDescription(listText(data.questions))
          .setFooter({ text: "Velo Studio • /postulaciones-config" })
      ],
      ephemeral: true
    });
  }
};
