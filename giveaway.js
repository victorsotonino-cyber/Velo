const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder
} = require("discord.js");
const config = require("./config");
const { emoji } = require("./ui");
const giveaways = require("./giveaway-service");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Sistema profesional de sorteos de FLUX STORE.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub
      .setName("crear")
      .setDescription("Publica un sorteo con botón de participación.")
      .addStringOption(option => option
        .setName("premio")
        .setDescription("Qué se sorteará.")
        .setMaxLength(250)
        .setRequired(true))
      .addStringOption(option => option
        .setName("duracion")
        .setDescription("Tiempo: 30m, 2h, 1d o 1w. Máximo 90 días.")
        .setMaxLength(20)
        .setRequired(true))
      .addIntegerOption(option => option
        .setName("ganadores")
        .setDescription("Cuántas personas ganarán (1–20).")
        .setMinValue(1)
        .setMaxValue(20)
        .setRequired(true))
      .addChannelOption(option => option
        .setName("canal")
        .setDescription("Canal donde se publicará. Por defecto, este canal.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false))
      .addStringOption(option => option
        .setName("descripcion")
        .setDescription("Reglas y detalles adicionales del sorteo.")
        .setMaxLength(1500)
        .setRequired(false))
      .addRoleOption(option => option
        .setName("rol")
        .setDescription("Rol que debe tener la persona para participar.")
        .setRequired(false)))
    .addSubcommand(sub => sub
      .setName("terminar")
      .setDescription("Finaliza un sorteo activo y elige a los ganadores.")
      .addStringOption(option => option
        .setName("id")
        .setDescription("ID del mensaje del sorteo.")
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName("cancelar")
      .setDescription("Cancela un sorteo activo.")
      .addStringOption(option => option
        .setName("id")
        .setDescription("ID del mensaje del sorteo.")
        .setRequired(true)))
    .addSubcommand(sub => sub
      .setName("reroll")
      .setDescription("Vuelve a sortear entre participantes que aún no ganaron.")
      .addStringOption(option => option
        .setName("id")
        .setDescription("ID del sorteo finalizado.")
        .setRequired(true))
      .addIntegerOption(option => option
        .setName("ganadores")
        .setDescription("Número de nuevos ganadores (1–20).")
        .setMinValue(1)
        .setMaxValue(20)
        .setRequired(false)))
    .addSubcommand(sub => sub
      .setName("lista")
      .setDescription("Muestra los sorteos activos de este servidor.")),

  async execute(i, client) {
    if (!i.inGuild()) {
      return i.reply({ content: "Este comando solo se puede usar dentro de un servidor.", ephemeral: true });
    }
    if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return i.reply({
        content: emoji(i.guild, "error", "❌") + " Necesitas el permiso **Gestionar servidor** para administrar sorteos.",
        ephemeral: true
      });
    }

    const subcommand = i.options.getSubcommand();

    if (subcommand === "crear") {
      const duration = giveaways.parseDuration(i.options.getString("duracion", true));
      if (duration.error) return i.reply({ content: emoji(i.guild, "error", "❌") + " " + duration.error, ephemeral: true });

      const channel = i.options.getChannel("canal") || i.channel;
      const role = i.options.getRole("rol");
      await i.deferReply({ ephemeral: true });

      try {
        const giveaway = await giveaways.createGiveaway(client, {
          guild: i.guild,
          channel,
          host: i.user,
          prize: i.options.getString("premio", true),
          description: i.options.getString("descripcion") || "",
          winnerCount: i.options.getInteger("ganadores", true),
          durationMs: duration.ms,
          requiredRoleId: role?.id || null
        });
        const link = "https://discord.com/channels/" + giveaway.guildId + "/" + giveaway.channelId + "/" + giveaway.messageId;
        return i.editReply({
          content: emoji(i.guild, "success", "✅") + " Sorteo publicado correctamente en " + channel + ".\n" +
            "**Premio:** " + giveaway.prize + "\n**ID:** " + giveaway.messageId + "\n[Ver sorteo](" + link + ")"
        });
      } catch (error) {
        console.error("Error creando giveaway:", error);
        return i.editReply({
          content: emoji(i.guild, "error", "❌") + " No pude crear el sorteo: " + String(error.message || error).slice(0, 1200)
        });
      }
    }

    if (subcommand === "lista") {
      const active = giveaways.activeForGuild(i.guildId);
      if (!active.length) {
        return i.reply({ content: emoji(i.guild, "info", "ℹ️") + " No hay sorteos activos en este servidor.", ephemeral: true });
      }
      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle(emoji(i.guild, "velo_giveaway", "🎉") + " FLUX STORE • Sorteos activos")
        .setDescription(active.slice(0, 20).map(g =>
          "**" + g.prize + "**\nCanal: <#" + g.channelId + "> · termina <t:" +
          Math.floor(g.endAt / 1000) + ":R>\nID: " + g.messageId
        ).join("\n\n").slice(0, 4000))
        .setFooter({ text: "FLUX STORE • /giveaway terminar | cancelar | reroll" });
      return i.reply({ embeds: [embed], ephemeral: true });
    }

    const id = i.options.getString("id", true).trim();
    if (!/^\d{17,20}$/.test(id)) {
      return i.reply({ content: emoji(i.guild, "error", "❌") + " Ese ID no parece ser un ID válido de mensaje de Discord.", ephemeral: true });
    }

    if (subcommand === "terminar") {
      const result = await giveaways.finishGiveaway(client, i.guildId, id, { force: true });
      if (!result.ok) {
        return i.reply({
          content: emoji(i.guild, "warning", "⚠️") + " No encontré un sorteo activo con ese ID en este servidor.",
          ephemeral: true
        });
      }
      const winners = result.giveaway.winners;
      return i.reply({
        content: emoji(i.guild, "success", "✅") + " Sorteo finalizado. " +
          (winners.length ? "Ganadores: " + winners.map(userId => "<@" + userId + ">").join(", ") : "No hubo participantes elegibles.") +
          "\nID: " + id,
        ephemeral: true,
        allowedMentions: { users: [] }
      });
    }

    if (subcommand === "cancelar") {
      const result = await giveaways.cancelGiveaway(client, i.guildId, id);
      return i.reply({
        content: result.ok
          ? emoji(i.guild, "success", "✅") + " Sorteo cancelado y botón desactivado."
          : emoji(i.guild, "warning", "⚠️") + " No encontré un sorteo activo con ese ID.",
        ephemeral: true
      });
    }

    if (subcommand === "reroll") {
      const count = i.options.getInteger("ganadores") || 1;
      const result = await giveaways.rerollGiveaway(client, i.guildId, id, count);
      if (!result.ok) {
        const explanation = result.reason === "not_ended"
          ? "El sorteo debe estar finalizado antes del reroll."
          : result.reason === "no_candidates"
            ? "No quedan participantes sin premio para elegir nuevos ganadores."
            : "No pude completar el reroll. Revisa el ID y el número de ganadores.";
        return i.reply({ content: emoji(i.guild, "warning", "⚠️") + " " + explanation, ephemeral: true });
      }
      return i.reply({
        content: emoji(i.guild, "success", "✅") + " Nuevos ganadores: " + result.winners.map(userId => "<@" + userId + ">").join(", "),
        ephemeral: true,
        allowedMentions: { users: [] }
      });
    }
  }
};
