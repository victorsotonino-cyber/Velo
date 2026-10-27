const {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType
} = require("discord.js");
const config = require("./config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("reglas-panel")
    .setDescription("Publica las reglas de NOVYZ Market en un canal.")
    .addChannelOption(o => o.setName("canal").setDescription("Canal donde publicar las reglas").addChannelTypes(ChannelType.GuildText).setRequired(true))
    .addStringOption(o => o.setName("titulo").setDescription("Título del panel").setMaxLength(100))
    .addStringOption(o => o.setName("reglas").setDescription("Reglas separadas por saltos de línea").setRequired(true).setMaxLength(3500))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    if (!interaction.inGuild()) return interaction.reply({ content: "Usa este comando dentro de un servidor.", ephemeral: true });
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: "Necesitas Gestionar servidor para publicar las reglas.", ephemeral: true });
    }
    const channel = interaction.options.getChannel("canal", true);
    const title = interaction.options.getString("titulo") || "📜 Reglas de NOVYZ Market";
    const raw = interaction.options.getString("reglas", true);
    const rules = raw.split("\n").map(s => s.trim()).filter(Boolean);
    if (!rules.length) return interaction.reply({ content: "Escribe al menos una regla.", ephemeral: true });
    const description = rules.map((rule, index) => "**" + (index + 1) + ".** " + rule).join("\n\n");
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(title)
      .setDescription(description.slice(0, 4000))
      .setFooter({ text: "NOVYZ Market • Respeta las reglas para mantener la comunidad segura." })
      .setTimestamp();
    await channel.send({ embeds: [embed] });
    return interaction.reply({ content: "✅ Panel de reglas publicado en " + channel + ".", ephemeral: true });
  }
};
