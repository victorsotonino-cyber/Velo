const { randomUUID } = require("crypto");
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const config = require("../../config");
const community = require("../../services/community-service");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sugerencia")
    .setDescription("Envía una idea para mejorar FLUX STORE.")
    .addSubcommand(sub => sub.setName("enviar").setDescription("Publica una sugerencia para que la comunidad la vote.")
      .addStringOption(option => option.setName("texto").setDescription("Explica la mejora que propones").setMinLength(10).setMaxLength(1200).setRequired(true))),
  async execute(interaction) {
    const id = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
    const suggestion = {
      id,
      guildId: interaction.guildId,
      userId: interaction.user.id,
      text: interaction.options.getString("texto").trim(),
      status: "pendiente",
      votes: {},
      createdAt: new Date().toISOString(),
      channelId: null,
      messageId: null
    };
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("flux_suggestion_vote:" + id + ":up").setLabel("A favor").setEmoji("👍").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("flux_suggestion_vote:" + id + ":down").setLabel("En contra").setEmoji("👎").setStyle(ButtonStyle.Secondary)
    );
    const configured = interaction.guild.channels.cache.get(config.channels.suggestions);
    const channel = configured?.isTextBased() ? configured : interaction.channel;
    const message = await channel.send({
      embeds: [community.buildSuggestionEmbed(suggestion)],
      components: [row],
      allowedMentions: { parse: [] }
    });
    suggestion.channelId = channel.id;
    suggestion.messageId = message.id;
    community.addSuggestion(suggestion);
    return interaction.reply({ content: "✅ Sugerencia publicada: " + message.url, ephemeral: true });
  }
};
