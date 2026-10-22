const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const config = require("./config");
const { emoji, emojiData } = require("./ui");
const PANEL_TITLE = "Flux STORE • Centro de tickets";

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket-panel")
    .setDescription("Publica el panel profesional de tickets.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  async execute(i) {
    if (!i.guild) {
      return i.reply({ content: "❌ Este comando solo funciona dentro de un servidor.", ephemeral: true });
    }

    if (!i.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
      return i.reply({ content: emoji(i.guild, "error", "❌") + " Necesitas **Gestionar canales** para publicar el panel de tickets.", ephemeral: true });
    }

    const categories = Object.entries(config.ticket?.categories || {});
    if (!categories.length) {
      return i.reply({ content: emoji(i.guild, "error", "❌") + " No hay categorías configuradas en config.js.", ephemeral: true });
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket_create")
      .setPlaceholder("🧾 Selecciona una categoría de ayuda")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(categories.map(([value, c]) => {
        const option = {
          label: String(c.label || value).slice(0, 100),
          value,
          description: String(c.description || "Abrir un ticket.").slice(0, 100)
        };
        // Primero usa el emoji personalizado configurado; si no existe, busca por nombre.
        const custom = (c.emojiId && i.guild.emojis.cache.get(c.emojiId))
          || i.guild.emojis.cache.find(e => e.name === c.emojiName)
          || i.guild.emojis.cache.find(e => e.name.toLowerCase() === ("Velo_" + value).toLowerCase());
        if (custom) option.emoji = { id: custom.id, name: custom.name, animated: custom.animated };
        else option.emoji = emojiData(i.guild, c.emojiKey || (value === "soporte" ? "velo_support" : value === "comprar" ? "velo_buy" : value === "reclamos" ? "velo_reclaim" : "velo_other"), "🎫");
        return option;
      }));

    const description = categories.map(([value, c]) => {
      const custom = (c.emojiId && i.guild.emojis.cache.get(c.emojiId))
        || i.guild.emojis.cache.find(e => e.name === c.emojiName)
        || i.guild.emojis.cache.find(e => e.name.toLowerCase() === ("Velo_" + value).toLowerCase());
      const fallbackKey = c.emojiKey || (value === "soporte" ? "velo_support" : value === "comprar" ? "velo_buy" : value === "reclamos" ? "velo_reclaim" : "velo_other");
      const icon = custom ? custom.toString() : emoji(i.guild, fallbackKey, "🎫");
      return icon + " **" + String(c.label || value) + "** — " + String(c.description || "Abre un ticket con el equipo.");
    }).join("\n");

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary || 0xE11D2E)
      .setTitle(emoji(i.guild, "brand", "✨") + " " + PANEL_TITLE)
      .setDescription("¿Necesitas ayuda? Selecciona una categoría en el menú y el equipo te atenderá.\n\n" + description)
      .setFooter({ text: "Flux STORE • Sistema de soporte" })
      .setTimestamp();

    try {
      // Edita el panel ya existente en este canal para evitar duplicados.
      const recent = await i.channel.messages.fetch({ limit: 50 });
      const existing = recent.find(m =>
        m.author?.id === i.client.user.id &&
        m.embeds?.some(e => (e.title || "").includes(PANEL_TITLE))
      );
      if (existing) {
        await existing.edit({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
        await i.reply({ content: "✅ Panel de tickets actualizado. No se publicó un duplicado.", ephemeral: true });
      } else {
        await i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
      }
    } catch (error) {
      console.error("Error publicando /ticket-panel:", error);
      const message = "❌ No pude publicar el panel. Comprueba que tengo permiso para enviar mensajes, insertar enlaces y usar emojis externos/personalizados.";
      if (i.replied || i.deferred) await i.followUp({ content: message, ephemeral: true }).catch(() => {});
      else await i.reply({ content: message, ephemeral: true }).catch(() => {});
    }
  }
};
