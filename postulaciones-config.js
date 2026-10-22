const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("./config");
const { emoji } = require("./ui");
const { readJSON, writeJSON } = require("./storage");

const DEFAULT_QUESTIONS = [
  "¿Cuál es tu nick o nombre con el que te conocen?",
  "¿Qué edad tienes?",
  "¿Por qué quieres entrar al equipo de Flux Store?",
  "¿Qué sabes hacer? Cuéntanos tus habilidades y experiencia.",
  "¿A qué puesto te gustaría postularte: Developer, Configurador, Diseñador o Staff?",
  "¿En qué servidores has trabajado anteriormente?",
  "¿Qué lenguajes de programación conoces y cuál dominas mejor?",
  "Menciona 2 plugins que conozcas y explica brevemente para qué sirven.",
  "¿En qué país estás y cuál es tu zona horaria?",
  "¿Cuántas horas al día puedes dedicar de forma realista a Flux Store?",
  "¿En qué horarios sueles estar disponible?",
  "¿A qué puesto te postulas: Helper, Moderador, Staff, Developer, Configurador o Diseñador?",
  "¿Tienes experiencia como Helper, Moderador o Staff? Explica dónde y qué hacías.",
  "¿Qué habilidades aportarías al equipo y qué te diferencia?",
  "Un miembro hace spam repetidamente después de recibir una advertencia. ¿Qué harías y por qué?",
  "Ves a alguien intentando estafar a otro miembro. ¿Cómo actuarías y qué pruebas guardarías?",
  "Un amigo tuyo incumple las reglas. ¿Cómo resolverías la situación?",
  "Dos usuarios discuten y ambos dicen tener razón. ¿Cómo investigarías el caso de forma imparcial?",
  "Si no sabes cómo resolver un problema, ¿qué harías antes de tomar una decisión?",
  "¿Cómo protegerías la información privada de los miembros y del equipo?",
  "¿Qué harías si otro miembro del Staff abusa de sus permisos?",
  "¿Cómo reaccionas ante críticas o cuando otro Staff te corrige?",
  "¿Has trabajado en otros servidores o comunidades? Indica cuáles y tus responsabilidades.",
  "¿Puedes comprometerte a respetar las reglas, mantener la actividad acordada y tratar a todos con respeto?",
  "¿Por qué deberíamos seleccionarte para el equipo de Flux Store?",
  "¿Hay algo más que quieras añadir a tu postulación?"
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
    if (!i.guild || !i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return i.reply({ content: emoji(i.guild, "error", "❌") + " Necesitas **Gestionar servidor** para configurar las postulaciones.", ephemeral: true });
    }
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
      embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle(emoji(i.guild, "settings", "⚙️") + " Preguntas de postulación").setDescription(listText(data.questions)).setFooter({ text: "Flux Store • /postulaciones-config" })],
      ephemeral: true
    });
  }
};
