const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require("discord.js");
const config = require("../config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("Publica un panel para crear tickets.")
    .setDefaultMemberPermissions(8),

  async execute(interaction) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket_create")
      .setPlaceholder("Selecciona el tipo de ticket")
      .addOptions(
        { label: "Soporte", value: "soporte", emoji: "🛠️" },
        { label: "Compras", value: "compras", emoji: "🛒" },
        { label: "Reclamos", value: "reclamo", emoji: "⚠️" },
        { label: "Partnership", value: "partnership", emoji: "🤝" },
        { label: "Otro", value: "otro", emoji: "📩" }
      );

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle("🎫 Velo Studio — Centro de Tickets")
      .setDescription(
        "Selecciona una categoría para abrir un ticket.\n\n" +
        "🛠️ Soporte\n🛒 Compras\n⚠️ Reclamos\n🤝 Partnership\n📩 Otro"
      );

    await interaction.reply({
      content: "✅ Panel de tickets enviado.",
      ephemeral: true
    });

    await interaction.channel.send({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu)]
    });
  }
};
