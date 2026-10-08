const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const config = require("./config");

function getEmoji(guild, category) {
  if (!guild?.emojis?.cache) return null;
  if (category.emojiId) {
    const byId = guild.emojis.cache.get(String(category.emojiId));
    if (byId) return byId;
  }
  if (category.emojiName) {
    const byName = guild.emojis.cache.find(e => e.name === category.emojiName);
    if (byName) return byName;
  }
  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("Publica el panel profesional de tickets.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(i) {
    const categories = config.ticket.categories;

    const options = Object.entries(categories).map(([value, c]) => {
      const option = {
        label: c.label,
        value,
        description: String(c.description || "Abrir un ticket.").slice(0, 100)
      };

      const e = getEmoji(i.guild, c);
      if (e) {
        option.emoji = { id: e.id, name: e.name, animated: e.animated };
      }

      return option;
    });

    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket_create")
      .setPlaceholder("Selecciona el tipo de ticket")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options);

    const lines = Object.values(categories).map(c => {
      const e = getEmoji(i.guild, c);
      return (e ? e.toString() + " " : "") +
        "**" + c.label + "** — " + String(c.description || "Soporte.");
    });

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle("Velo Studio • Tickets")
      .setDescription(
        "Necesitas ayuda? Abre un ticket y el equipo de Velo Studio te atenderá.\n\n" +
        lines.join("\n")
      )
      .setFooter({ text: "Velo Studio • Sistema de soporte" })
      .setTimestamp();

    await i.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu)]
    });
  }
};
