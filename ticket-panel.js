const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require("discord.js");
const config = require("./config");
const { emojiData, find } = require("./ui");

function customEmoji(guild, key, category) {
  const names = {
    soporte: ["Velo_Support", "velo_support", "Support", "support", "Velo_Soporte", "soporte", "Velo_Ticket"],
    comprar: ["Velo_Buy", "velo_buy", "Velo_Comprar", "comprar", "buy", "shop", "Velo_Success", "Velo_Ticket"],
    reclamos: ["Velo_Reclaim", "velo_reclaim", "Velo_Claim", "Velo_Reclamos", "reclamos", "claim", "Velo_Error", "Velo_Ticket"],
    otros: ["Velo_Other", "velo_other", "Velo_Otros", "otros", "other", "Velo_Ticket"]
  };

  if (category?.emojiId) {
    const byId = guild.emojis.cache.get(String(category.emojiId));
    if (byId) return byId;
  }

  for (const name of [category?.emojiName, ...(names[key] || [])]) {
    if (!name) continue;
    const found = find(guild, [name]);
    if (found) return found;
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

    const resolved = {};
    for (const [key, category] of Object.entries(categories)) {
      resolved[key] = customEmoji(i.guild, key, category);
    }

    const options = Object.entries(categories).map(([value, category]) => {
      const option = {
        label: category.label,
        value,
        description: String(category.description || "Abrir un ticket.").slice(0, 100)
      };

      const e = resolved[value];
      if (e) {
        option.emoji = {
          id: e.id,
          name: e.name,
          animated: Boolean(e.animated)
        };
      }

      return option;
    });

    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket_create")
      .setPlaceholder("Selecciona el tipo de ticket")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options);

    const lines = Object.entries(categories).map(([key, category]) => {
      const e = resolved[key];
      return (e ? e.toString() + " " : "") +
        "**" + category.label + "** — " +
        String(category.description || "Soporte.");
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
