const { randomUUID } = require("crypto");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
const { readJSON, writeJSON } = require("./storage");

const FILE = "flux-store-suggestions.json";
const cooldowns = new Map();

function readSuggestions() {
  const value = readJSON(FILE, []);
  return Array.isArray(value) ? value : [];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sugerencia")
    .setDescription("Envía una idea para mejorar FLUX STORE.")
    .addStringOption(o => o.setName("titulo").setDescription("Título breve para tu sugerencia").setMinLength(4).setMaxLength(100).setRequired(true))
    .addStringOption(o => o.setName("idea").setDescription("Explica la mejora que propones").setMinLength(10).setMaxLength(1000).setRequired(true)),
  async execute(i) {
    if (!i.guildId) return i.reply({ content: "Este comando solo funciona dentro de un servidor.", ephemeral: true });
    if (!config.channels.suggestions) {
      return i.reply({ content: "El equipo todavía no configuró SUGGESTIONS_CHANNEL_ID. Pide que lo configure para recibir sugerencias.", ephemeral: true });
    }
    const key = i.guildId + ":" + i.user.id;
    const now = Date.now();
    const previous = cooldowns.get(key) || 0;
    if (now - previous < 30000) {
      return i.reply({ content: "Espera " + Math.ceil((30000 - (now - previous)) / 1000) + " segundos antes de enviar otra sugerencia.", ephemeral: true });
    }
    const channel = await i.guild.channels.fetch(config.channels.suggestions).catch(() => null);
    if (!channel?.isTextBased() || !channel.send) {
      return i.reply({ content: "No pude acceder al canal de sugerencias configurado. Revisa el ID y los permisos del bot.", ephemeral: true });
    }

    const title = i.options.getString("titulo").trim();
    const idea = i.options.getString("idea").trim();
    const suggestions = readSuggestions();
    const record = {
      id: randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase(),
      guildId: i.guildId,
      userId: i.user.id,
      userTag: i.user.tag,
      title,
      idea,
      status: "pendiente",
      createdAt: new Date().toISOString(),
      messageId: null,
      channelId: channel.id
    };
    const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle("💡 Sugerencia · " + title)
      .setDescription(idea)
      .setAuthor({ name: "Enviada por " + i.user.tag, iconURL: i.user.displayAvatarURL({ size: 128 }) })
      .addFields({ name: "Referencia", value: "#" + record.id, inline: true }, { name: "Estado", value: "Pendiente de revisión", inline: true })
      .setFooter({ text: "FLUX STORE • Reacciona para apoyar la idea" })
      .setTimestamp(new Date(record.createdAt));

    try {
      const message = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
      record.messageId = message.id;
      await message.react("👍").catch(() => {});
      await message.react("👎").catch(() => {});
      suggestions.push(record);
      writeJSON(FILE, suggestions.slice(-5000));
      cooldowns.set(key, now);
      return i.reply({ content: "✅ Sugerencia enviada. Referencia: #" + record.id + ".", ephemeral: true, allowedMentions: { parse: [] } });
    } catch (error) {
      console.error("No se pudo publicar la sugerencia:", error);
      return i.reply({ content: "No pude publicar la sugerencia. Comprueba que el bot puede enviar mensajes y añadir reacciones.", ephemeral: true });
    }
  }
};
