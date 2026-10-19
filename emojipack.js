const { SlashCommandBuilder, MessageFlags } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("emoji-pack")
    .setDescription("Acceso rápido al instalador de emojis de Emoji.gg."),
  async execute(i) {
    return i.reply({
      content: "Usa /emojis-pack para instalar los packs PNG/GIF originales de Emoji.gg. Este comando antiguo ya no genera iconos ni convierte emojis Unicode.",
      flags: MessageFlags.Ephemeral
    });
  }
};
