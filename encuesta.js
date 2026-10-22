const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");

const REACTIONS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];

module.exports = {
  data: new SlashCommandBuilder()
    .setName("encuesta")
    .setDescription("Crea una encuesta con reacciones.")
    .addStringOption(o => o.setName("pregunta").setDescription("Pregunta que se va a votar").setMinLength(5).setMaxLength(220).setRequired(true))
    .addStringOption(o => o.setName("opciones").setDescription("De 2 a 10 opciones, separadas por |").setMinLength(3).setMaxLength(900).setRequired(true)),
  async execute(i) {
    const question = i.options.getString("pregunta").trim();
    const options = i.options.getString("opciones").split("|").map(value => value.trim()).filter(Boolean);
    if (options.length < 2 || options.length > 10) {
      return i.reply({ content: "Debes indicar entre 2 y 10 opciones separadas con el símbolo |. Ejemplo: Rojo | Azul | Morado.", ephemeral: true });
    }
    if (options.some(value => value.length > 80)) {
      return i.reply({ content: "Cada opción debe tener 80 caracteres o menos.", ephemeral: true });
    }
    const normalized = options.map(value => value.toLowerCase());
    if (new Set(normalized).size !== normalized.length) {
      return i.reply({ content: "No repitas una misma opción en la encuesta.", ephemeral: true });
    }
    const description = options.map((value, index) => REACTIONS[index] + " **" + value + "**").join("\n");
    const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle("📊 " + question)
      .setDescription(description)
      .setFooter({ text: "FLUX STORE • Vota con una reacción" })
      .setTimestamp();
    const message = await i.channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    for (let index = 0; index < options.length; index++) {
      await message.react(REACTIONS[index]).catch(() => {});
    }
    return i.reply({ content: "✅ Encuesta publicada.", ephemeral: true });
  }
};
