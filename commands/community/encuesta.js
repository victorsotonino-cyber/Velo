const { randomUUID } = require("crypto");
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require("discord.js");
const community = require("../../services/community-service");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("encuesta")
    .setDescription("Crea una encuesta con votación interactiva.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(option => option.setName("pregunta").setDescription("Pregunta de la encuesta").setMinLength(5).setMaxLength(240).setRequired(true))
    .addStringOption(option => option.setName("opcion1").setDescription("Primera opción").setMinLength(1).setMaxLength(75).setRequired(true))
    .addStringOption(option => option.setName("opcion2").setDescription("Segunda opción").setMinLength(1).setMaxLength(75).setRequired(true))
    .addStringOption(option => option.setName("opcion3").setDescription("Tercera opción (opcional)").setMinLength(1).setMaxLength(75).setRequired(false))
    .addStringOption(option => option.setName("opcion4").setDescription("Cuarta opción (opcional)").setMinLength(1).setMaxLength(75).setRequired(false))
    .addStringOption(option => option.setName("opcion5").setDescription("Quinta opción (opcional)").setMinLength(1).setMaxLength(75).setRequired(false)),
  async execute(interaction) {
    const options = ["opcion1", "opcion2", "opcion3", "opcion4", "opcion5"]
      .map(name => interaction.options.getString(name))
      .filter(Boolean)
      .map(value => value.trim());
    if (new Set(options.map(value => value.toLowerCase())).size !== options.length) {
      return interaction.reply({ content: "❌ Cada opción debe ser distinta.", ephemeral: true });
    }

    const id = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
    const poll = {
      id,
      guildId: interaction.guildId,
      creatorId: interaction.user.id,
      creatorTag: interaction.user.tag,
      question: interaction.options.getString("pregunta").trim(),
      options,
      votes: {},
      createdAt: new Date().toISOString(),
      channelId: null,
      messageId: null
    };
    const buttons = options.map((label, index) =>
      new ButtonBuilder()
        .setCustomId("flux_poll_vote:" + id + ":" + index)
        .setLabel((index + 1) + ". " + label.slice(0, 75))
        .setStyle(ButtonStyle.Primary)
    );
    const message = await interaction.channel.send({
      embeds: [community.buildPollEmbed(poll)],
      components: [new ActionRowBuilder().addComponents(buttons)],
      allowedMentions: { parse: [] }
    });
    poll.channelId = interaction.channelId;
    poll.messageId = message.id;
    community.addPoll(poll);
    return interaction.reply({ content: "✅ Encuesta publicada: " + message.url, ephemeral: true });
  }
};
