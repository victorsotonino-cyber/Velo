const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder().setName("help").setDescription("Muestra la ayuda de DATASHOP."),
  async execute(interaction, client) {
    const names = [...client.commands.keys()].map(name => `/${name}`).sort();
    const embed = new EmbedBuilder()
      .setColor(0x8B5CF6)
      .setTitle("DATASHOP | Centro de ayuda")
      .setDescription("Bot de tienda y comunidad. Los módulos se activarán de forma progresiva.")
      .addFields({ name: "Comandos disponibles", value: names.join(", ") || "Todavía no hay comandos." })
      .setFooter({ text: "DATASHOP • Base inicial" })
      .setTimestamp();
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};