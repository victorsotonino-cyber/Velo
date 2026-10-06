const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
const { emoji } = require("./ui");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Información sobre tickets.")
    .addStringOption(o => o.setName("tipo").setDescription("Tipo de ticket").setRequired(false).addChoices(
      { name: "Soporte", value: "soporte" },
      { name: "Comprar", value: "comprar" },
      { name: "Reclamos", value: "reclamos" },
      { name: "Otros", value: "otros" }
    )),
  async execute(i) {
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(emoji(i.guild, "ticket", "🎫") + " Sistema de tickets")
      .setDescription("Usa **/ticket-panel** para abrir un ticket.")
      .setFooter({ text: "Velo Studio" });
    await i.reply({ embeds: [embed], ephemeral: true });
  }
};
