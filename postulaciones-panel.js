const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const config = require("./config");
const { emoji, emojiData } = require("./ui");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("postulaciones-panel")
    .setDescription("Publica el panel para postularse.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(i) {
    await i.deferReply({ ephemeral: true });

    try {
      const me = i.guild?.members?.me || await i.guild?.members?.fetchMe();
      if (!me) return i.editReply({ content: emoji(i.guild, "error", "❌") + " No pude localizar al bot en este servidor." });

      const perms = i.channel?.permissionsFor(me);
      if (!perms?.has(PermissionFlagsBits.ViewChannel)) {
        return i.editReply({ content: emoji(i.guild, "error", "❌") + " El bot no tiene **Ver canales** en este canal." });
      }
      if (!perms?.has(PermissionFlagsBits.SendMessages)) {
        return i.editReply({ content: emoji(i.guild, "error", "❌") + " El bot no tiene **Enviar mensajes** en este canal." });
      }
      if (!perms?.has(PermissionFlagsBits.EmbedLinks)) {
        return i.editReply({ content: emoji(i.guild, "error", "❌") + " El bot necesita **Insertar enlaces** para publicar el panel." });
      }

      const staff = emoji(i.guild, "velo_staff", "👥");
      const nuevo = emoji(i.guild, "velo_new", "🆕");
      const developer = emoji(i.guild, "velo_developer", "💻");
      const designer = emoji(i.guild, "velo_designer", "🎨");
      const verified = emoji(i.guild, "velo_verified", "✅");

      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(staff + " Postulaciones — Velo Studio")
        .setDescription(
          nuevo + " **¿Quieres formar parte del equipo?**\n\n" +
          verified + " Pulsa el botón de abajo para abrir una **postulación privada**.\n" +
          "📝 Responderás las preguntas una por una y el Staff revisará tu solicitud.\n\n" +
          developer + " **Developer**\n" +
          designer + " **Diseñador**\n" +
          staff + " **Staff / Configurador**"
        )
        .setFooter({ text: "Velo Studio • Sistema de postulaciones" })
        .setTimestamp();

      const buttonEmoji = emojiData(i.guild, "velo_new", "🆕");
      const button = new ButtonBuilder()
        .setCustomId("application_panel_open")
        .setLabel("Postularme")
        .setStyle(ButtonStyle.Success)
        .setEmoji(buttonEmoji);

      const row = new ActionRowBuilder().addComponents(button);

      await i.channel.send({ embeds: [embed], components: [row] });

      return i.editReply({
        content: emoji(i.guild, "success", "✅") + " Panel de postulaciones enviado."
      });
    } catch (error) {
      console.error("Error enviando panel de postulaciones:", error);

      let detail = "No pude enviar el panel.";
      if (error?.code === 50013) detail += " El bot no tiene los permisos necesarios en este canal.";
      else if (error?.code === 50001) detail += " El bot no tiene acceso a este canal.";
      else if (error?.message) detail += " Error: " + error.message.slice(0, 300);

      return i.editReply({
        content: emoji(i.guild, "error", "❌") + " " + detail
      }).catch(() => {});
    }
  }
};
