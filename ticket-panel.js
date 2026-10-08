const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const config = require("./config");

function findById(guild, id) {
  if (!id || !guild?.emojis?.cache) return null;
  return guild.emojis.cache.get(String(id)) || null;
}

function findByNames(guild, names) {
  if (!guild?.emojis?.cache) return null;
  for (const name of names) {
    const found = guild.emojis.cache.find(
      e => String(e.name || "").toLowerCase() === String(name).toLowerCase()
    );
    if (found) return found;
  }
  return null;
}

function semanticNames(key, category) {
  const base = [category?.emojiName].filter(Boolean);
  const map = {
    soporte: ["Velo_Support","velo_support","Velo_Soporte","velo_soporte","support","soporte","help"],
    comprar: ["Velo_Buy","velo_buy","Velo_Comprar","velo_comprar","Velo_Shop","velo_shop","buy","comprar","compra","shop","store","cart"],
    reclamos: ["Velo_Reclaim","velo_reclaim","Velo_Claim","velo_claim","Velo_Reclamos","velo_reclamos","reclaim","reclamos","reclamo","claim","refund"],
    otros: ["Velo_Other","velo_other","Velo_Otros","velo_otros","other","otros","misc"]
  };
  return [...base, ...(map[key] || [])];
}

function wordMatch(guild, key, used) {
  const words = {
    soporte: ["support","soport","help"],
    comprar: ["buy","compr","shop","store","cart","sale"],
    reclamos: ["reclaim","recl","claim","refund","complaint"],
    otros: ["other","otro","misc"]
  }[key] || [];

  return guild.emojis.cache.find(e => {
    if (used.has(e.id)) return false;
    const n = String(e.name || "").toLowerCase();
    return words.some(word => n.includes(word));
  }) || null;
}

function resolveTicketEmojis(guild, categories) {
  const result = {};
  const used = new Set();

  for (const [key, category] of Object.entries(categories)) {
    let e = findById(guild, category.emojiId);

    if (!e) e = findByNames(guild, semanticNames(key, category));
    if (!e) e = wordMatch(guild, key, used);

    if (e) {
      result[key] = e;
      used.add(e.id);
    }
  }

  // Si algún emoji antiguo ya no existe o cambió de nombre, usamos
  // emojis personalizados que realmente pertenezcan a ESTE servidor.
  // Así nunca se envía un ID inválido que rompa /ticket-panel.
  const missing = Object.keys(categories).filter(key => !result[key]);
  if (missing.length) {
    const available = guild.emojis.cache.filter(e => !used.has(e.id)).first(missing.length);
    for (let n = 0; n < missing.length; n++) {
      const e = available?.[n];
      if (!e) break;
      result[missing[n]] = e;
      used.add(e.id);
    }
  }

  return result;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("Publica el panel profesional de tickets.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(i) {
    const categories = config.ticket.categories;
    const emojis = resolveTicketEmojis(i.guild, categories);

    const options = Object.entries(categories).map(([value, c]) => {
      const option = {
        label: c.label,
        value,
        description: String(c.description || "Abrir un ticket.").slice(0, 100)
      };

      const e = emojis[value];
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

    const lines = Object.entries(categories).map(([key, c]) => {
      const e = emojis[key];
      return (e ? e.toString() + " " : "") +
        "**" + c.label + "** — " +
        String(c.description || "Soporte.");
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
