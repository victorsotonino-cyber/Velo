const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const config = require("./config");
const { find, NAMES } = require("./ui");

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const SMART_NAMES = {
  soporte: ["soporte","support","help","ayuda","supportticket"],
  comprar: ["comprar","compra","buy","buying","shop","store","tienda","money","cart","carrito","price","precios"],
  reclamos: ["reclamo","reclamos","reclamacion","claim","reclaim","report","reporte","warning","problem","problema","error"],
  otros: ["otros","other","misc","miscellaneous","general","ticket"]
};

function getEmoji(guild, category, type) {
  if (!guild?.emojis?.cache) return undefined;

  // Primero usa el emoji configurado si todavía existe en ESTE servidor.
  if (category?.emojiId) {
    const byId = guild.emojis.cache.get(category.emojiId);
    if (byId?.available !== false) return byId;
  }

  if (category?.emojiName) {
    const byName = guild.emojis.cache.find(e => normalize(e.name) === normalize(category.emojiName));
    if (byName?.available !== false) return byName;
  }

  // Después intenta los alias conocidos de Velo.
  const aliases = NAMES[category?.emojiKey] || [];
  const byAlias = find(guild, aliases);
  if (byAlias?.available !== false) return byAlias;

  // Finalmente busca un emoji PERSONALIZADO del propio servidor por nombre semántico.
  // Así no se muestran emojis Unicode si el servidor ya tiene uno adecuado.
  const words = SMART_NAMES[type] || [];
  const scored = guild.emojis.cache
    .filter(e => e.available !== false && e.name)
    .map(e => {
      const name = normalize(e.name);
      let score = 0;
      for (const word of words) {
        const w = normalize(word);
        if (!w) continue;
        if (name === w) score += 100;
        else if (name.includes(w)) score += 30;
      }
      return { e, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.e;
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
          const option = {
            label: c.label,
            value,
            description: String(c.description || "Abrir un ticket.").slice(0, 100)
          };

          const e = getEmoji(i.guild, c, value);
          if (e) option.emoji = { id: e.id, name: e.name, animated: e.animated };

          return option;
        })
      );

    const lines = Object.entries(categories).map(([type, c]) => {
      const e = getEmoji(i.guild, c, type);
      const prefix = e ? e.toString() + " " : "";
      return prefix + "**" + c.label + "** — " + String(c.description || "Soporte.");
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
