const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const config = require("./config");
const { emoji } = require("./ui");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("postulaciones-panel")
    .setDescription("Publica el panel para postularse.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(i) {
    try {
      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(emoji(i.guild, "users", "👥") + " Postulaciones — Velo Studio")
        .setDescription(
          "¿Quieres formar parte del equipo?\n\n" +
          "Pulsa **Postularme** para abrir un canal privado y responder las preguntas una por una."
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("application_panel_open")
          .setLabel("Postularme")
          .setStyle(ButtonStyle.Success)
          .setEmoji(emoji(i.guild, "add", "➕"))
      );

      await i.channel.send({ embeds: [embed], components: [row] });

      return i.reply({
        content: emoji(i.guild, "success", "✅") + " Panel de postulaciones enviado.",
        ephemeral: true
      });
    } catch (error) {
      console.error("Error enviando panel:", error);
      return i.reply({
        content: emoji(i.guild, "error", "❌") + " No pude enviar el panel. Revisa mis permisos en este canal.",
        ephemeral: true
      }).catch(() => {});
    }
  }
};
