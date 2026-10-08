const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const config = require("./config");

function getEmoji(guild, category) {
  if (!guild) return undefined;
  let e = category?.emojiId ? guild.emojis.cache.get(category.emojiId) : undefined;
  if (!e && category?.emojiName) e = guild.emojis.cache.find(x => x.name === category.emojiName);
  if (!e) return undefined;
  return { id: e.id, name: e.name, animated: e.animated };
}

module.exports = {
  data: new SlashCommandBuilder().setName("ticket-panel").setDescription("Publica el panel profesional de tickets.").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  async execute(i) {
    const categories = config.ticket.categories;
    const menu = new StringSelectMenuBuilder().setCustomId("ticket_create").setPlaceholder("Selecciona el tipo de ticket").setMinValues(1).setMaxValues(1)
      .addOptions(Object.entries(categories).map(([value, c]) => {
        const option = { label: c.label, value, description: String(c.description || "Abrir un ticket.").slice(0, 100) };
        const emoji = getEmoji(i.guild, c);
        if (emoji) option.emoji = emoji;
        return option;
      }));
    const lines = Object.values(categories).map(c => {
      const emoji = getEmoji(i.guild, c);
      const prefix = emoji ? "<" + (emoji.animated ? "a" : "") + ":" + emoji.name + ":" + emoji.id + "> " : "";
      return prefix + "**" + c.label + "** — " + String(c.description || "Soporte.");
    });
    const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle("Velo Studio • Tickets")
      .setDescription("Necesitas ayuda? Abre un ticket y el equipo de Velo Studio te atenderá.\n\n" + lines.join("\n"))
      .setFooter({ text: "Velo Studio • Sistema de soporte" }).setTimestamp();
    await i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
  }
};