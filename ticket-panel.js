const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const config = require("./config");
const { emoji } = require("./ui");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("Publica el panel de tickets.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(i) {
    const e = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(emoji(i.guild, "ticket", "🎫") + " Tickets | Velo Studio")
      .setDescription("Selecciona el tipo de ticket que necesitas.");

    const m = new StringSelectMenuBuilder()
      .setCustomId("ticket_create")
      .setPlaceholder("Selecciona una categoría")
      .addOptions(
        { label: "Soporte", value: "soporte", description: "Necesitas ayuda o soporte con algo.", emoji: { id: "1554450601595633686", name: "emoji_23" } },
        { label: "Comprar", value: "comprar", description: "¿Quieres comprar algo? Abre tu ticket aquí.", emoji: { id: "1550144465765793792", name: "emoji_10" } },
        { label: "Reclamos", value: "reclamos", description: "Presenta un reclamo o informa de un problema.", emoji: { id: "1550144504990801930", name: "emoji_11" } },
        { label: "Otros", value: "otros", description: "Para cualquier consulta que no encaje arriba.", emoji: { id: "1550144328540618882", name: "emoji_9" } }
      );

    await i.reply({
      embeds: [e],
      components: [new ActionRowBuilder().addComponents(m)]
    });
  }
};
