const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const config = require("./config");
const { emoji, emojiData } = require("./ui");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("postulaciones-panel")
    .setDescription("Publica el panel para postularse.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(i) {
    // Respondemos primero para que cualquier error posterior no termine en
    // el mensaje genérico de "No pude completar esa acción".
    await i.deferReply({ ephemeral: true });

    try {
      const me = i.guild?.members?.me || await i.guild?.members?.fetchMe();
      if (!me) {
        return i.editReply({
          content: "❌ No pude localizar al miembro del bot en este servidor."
        });
      }

      const perms = i.channel?.permissionsFor(me);
      if (!perms?.has(PermissionFlagsBits.ViewChannel)) {
        return i.editReply({
          content: "❌ El bot no tiene **Ver canales** en este canal."
        });
      }

      if (!perms?.has(PermissionFlagsBits.SendMessages)) {
        return i.editReply({
          content: "❌ El bot no tiene **Enviar mensajes** en este canal."
        });
      }

      if (!perms?.has(PermissionFlagsBits.EmbedLinks)) {
        return i.editReply({
          content: "❌ El bot no tiene **Insertar enlaces**. Necesita este permiso para publicar el panel con embed."
        });
      }

      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(emoji(i.guild, "users", "👥") + " Postulaciones — Velo Studio")
        .setDescription(
          "¿Quieres formar parte del equipo?\n\n" +
          "Pulsa **Postularme** para abrir un canal privado y responder las preguntas una por una."
        );

      const addEmoji = emojiData(i.guild, "add", "➕");
      const button = new ButtonBuilder()
        .setCustomId("application_panel_open")
        .setLabel("Postularme")
        .setStyle(ButtonStyle.Success);

      if (typeof addEmoji === "object") {
        button.setEmoji(addEmoji);
      } else {
        button.setEmoji(addEmoji);
      }

      const row = new ActionRowBuilder().addComponents(button);

      await i.channel.send({ embeds: [embed], components: [row] });

      return i.editReply({
        content: emoji(i.guild, "success", "✅") + " Panel de postulaciones enviado."
      });
    } catch (error) {
      console.error("Error enviando panel de postulaciones:", {
        code: error?.code,
        message: error?.message,
        rawError: error?.rawError
      });

      let detail = "No pude enviar el panel.";
      if (error?.code === 50013) {
        detail += " El bot no tiene los permisos necesarios en este canal.";
      } else if (error?.code === 50001) {
        detail += " El bot no tiene acceso a este canal.";
      } else if (error?.message) {
        detail += " Error: " + error.message.slice(0, 300);
      }

      return i.editReply({
        content: emoji(i.guild, "error", "❌") + " " + detail
      }).catch(() => {});
    }
  }
};
