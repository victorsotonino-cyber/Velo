const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const config = require("./config");

function serverEmoji(guild, category) {
  if (!category?.emojiId || !guild?.emojis) return null;
  const e = guild.emojis.cache.get(category.emojiId);
  if (!e) return null;
  return e;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("Publica el panel profesional de tickets.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(i) {
    const categories = config.ticket.categories;

    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket_create")
      .setPlaceholder("Selecciona el tipo de ticket")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        Object.entries(categories).map(([value, c]) => {
          const e = serverEmoji(i.guild, c);
          const option = {
            label: c.label,
            value,
            description: String(c.description || "Abrir un ticket.").slice(0, 100)
          };
          if (e) option.emoji = { id: e.id, name: e.name, animated: e.animated };
          return option;
        })
      );

    const description = Object.values(categories)
      .map(c => {
        const e = serverEmoji(i.guild, c);
        const icon = e ? e.toString() + " " : "";
        return icon + "**" + c.label + "** — " + String(c.description || "Soporte.");
      })
      .join("\n");

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle("Velo Studio • Tickets")
      .setDescription(
        "Necesitas ayuda? Abre un ticket y el equipo de Velo Studio te atenderá.\n\n" +
        description
      )
      .setFooter({ text: "Velo Studio • Sistema de soporte" })
      .setTimestamp();

    await i.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu)]
    });
  }
};
