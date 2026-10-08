const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const config = require("./config");

function getEmoji(guild, key, category) {
  if (!guild?.emojis?.cache) return null;

  if (category?.emojiId) {
    const byId = guild.emojis.cache.get(String(category.emojiId));
    if (byId) return byId;
  }

  const names = [
    category?.emojiName,
    ...(key === "soporte" ? ["Velo_Support", "velo_support", "support", "soporte"] : []),
    ...(key === "comprar" ? ["Velo_Buy", "velo_buy", "buy", "comprar", "compra", "shop", "shopping", "cart", "store"] : []),
    ...(key === "reclamos" ? ["Velo_Reclaim", "velo_reclaim", "reclaim", "reclamos", "reclamo", "claim", "refund"] : []),
    ...(key === "otros" ? ["Velo_Other", "velo_other", "other", "otros", "misc"] : [])
  ].filter(Boolean);

  for (const name of names) {
    const found = guild.emojis.cache.find(e => e.name?.toLowerCase() === String(name).toLowerCase());
    if (found) return found;
  }

  const words = key === "comprar"
    ? ["buy", "compr", "shop", "store", "cart", "sale"]
    : key === "reclamos"
      ? ["reclaim", "recl", "claim", "refund", "complaint"]
      : key === "soporte"
        ? ["support", "soport", "help"]
        : ["other", "otro", "misc"];

  return guild.emojis.cache.find(e => {
    const n = String(e.name || "").toLowerCase();
    return words.some(word => n.includes(word));
  }) || null;
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

      const e = getEmoji(i.guild, value, c);
      if (e) option.emoji = { id: e.id, name: e.name, animated: e.animated };
      return option;
    });

    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket_create")
      .setPlaceholder("Selecciona el tipo de ticket")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options);

    const lines = Object.entries(categories).map(([key, c]) => {
      const e = getEmoji(i.guild, key, c);
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
