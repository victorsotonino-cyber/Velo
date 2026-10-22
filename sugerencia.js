"use strict";

const { randomUUID } = require("crypto");
const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType
} = require("discord.js");
const config = require("./config");
const store = require("./store-service");
const { readJSON, writeJSON } = require("./storage");

const FILE = "flux-store-suggestions.json";

function readSuggestions() {
  const rows = readJSON(FILE, []);
  return Array.isArray(rows) ? rows : [];
}

function suggestionEmbed(suggestion) {
  const status = suggestion.status === "approved" ? "✅ Aprobada" :
    suggestion.status === "rejected" ? "❌ Rechazada" : "🟡 Pendiente";
  const ups = Array.isArray(suggestion.upvotes) ? suggestion.upvotes.length : 0;
  const downs = Array.isArray(suggestion.downvotes) ? suggestion.downvotes.length : 0;
  return new EmbedBuilder()
    .setColor(suggestion.status === "approved" ? config.colors.success :
      suggestion.status === "rejected" ? config.colors.error : config.colors.primary)
    .setTitle("💡 Sugerencia #" + suggestion.id + " • FLUX STORE")
    .setDescription(suggestion.text.slice(0, 3000))
    .addFields(
      { name: "Estado", value: status, inline: true },
      { name: "A favor", value: String(ups), inline: true },
      { name: "En contra", value: String(downs), inline: true }
    )
    .setFooter({ text: "Propuesta de " + String(suggestion.userTag || "miembro").slice(0, 80) })
    .setTimestamp(new Date(suggestion.createdAt));
}

function suggestionButtons(suggestion) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("suggestion_vote:up:" + suggestion.id)
      .setLabel("A favor").setEmoji("👍").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("suggestion_vote:down:" + suggestion.id)
      .setLabel("En contra").setEmoji("👎").setStyle(ButtonStyle.Secondary)
  )];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("sugerencia")
    .setDescription("Envía ideas y consulta sugerencias de la comunidad.")
    .addSubcommand(function (s) {
      return s.setName("enviar").setDescription("Envía una idea para mejorar FLUX STORE.")
        .addStringOption(function (o) {
          return o.setName("idea").setDescription("Describe la mejora que propones")
            .setMinLength(10).setMaxLength(1800).setRequired(true);
        });
    })
    .addSubcommand(function (s) {
      return s.setName("listar").setDescription("Muestra las últimas sugerencias registradas.");
    })
    .addSubcommand(function (s) {
      return s.setName("estado").setDescription("Aprueba, rechaza o reabre una sugerencia (staff).")
        .addStringOption(function (o) {
          return o.setName("id").setDescription("ID de la sugerencia")
            .setMinLength(4).setMaxLength(12).setRequired(true);
        })
        .addStringOption(function (o) {
          return o.setName("estado").setDescription("Nuevo estado de la propuesta").setRequired(true)
            .addChoices(
              { name: "Pendiente", value: "pending" },
              { name: "Aprobada", value: "approved" },
              { name: "Rechazada", value: "rejected" }
            );
        });
    }),
  async execute(i) {
    if (!i.guildId) return i.reply({ content: "Este comando solo funciona dentro del servidor.", ephemeral: true });
    const rows = readSuggestions();
    const action = i.options.getSubcommand();

    if (action === "estado") {
      if (!store.isStoreStaff(i.member)) {
        return i.reply({ content: "❌ Solo el personal autorizado puede cambiar el estado.", ephemeral: true });
      }
      const id = i.options.getString("id").trim().toUpperCase();
      const nextStatus = i.options.getString("estado");
      const suggestion = rows.find(function (row) {
        return row.guildId === i.guildId && row.id === id;
      });
      if (!suggestion) return i.reply({ content: "❌ No encontré esa sugerencia.", ephemeral: true });

      suggestion.status = nextStatus;
      suggestion.updatedAt = new Date().toISOString();
      writeJSON(FILE, rows);

      let updated = false;
      if (suggestion.channelId && suggestion.messageId) {
        const channel = await i.guild.channels.fetch(suggestion.channelId).catch(function () { return null; });
        if (channel && channel.isTextBased()) {
          const message = await channel.messages.fetch(suggestion.messageId).catch(function () { return null; });
          if (message) {
            await message.edit({
              embeds: [suggestionEmbed(suggestion)],
              components: nextStatus === "pending" ? suggestionButtons(suggestion) : []
            }).then(function () { updated = true; })
              .catch(function (error) { console.error("No se pudo actualizar la sugerencia:", error.message); });
          }
        }
      }

      const label = nextStatus === "approved" ? "aprobada" :
        nextStatus === "rejected" ? "rechazada" : "reabierta para votar";
      return i.reply({
        content: "✅ Sugerencia #" + id + " " + label + "." + (updated ? " El mensaje público también fue actualizado." : " El registro se guardó, pero no pude editar el mensaje original."),
        ephemeral: true
      });
    }

    if (action === "enviar") {
      const text = i.options.getString("idea").trim();
      const recentFromUser = rows.filter(function (row) {
        return row.guildId === i.guildId && row.userId === i.user.id &&
          Date.now() - Date.parse(row.createdAt) < 10 * 60 * 1000;
      });
      if (recentFromUser.length >= 3) {
        return i.reply({ content: "⏳ Has enviado varias sugerencias en poco tiempo. Inténtalo de nuevo más tarde.", ephemeral: true });
      }

      let id;
      do {
        id = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
      } while (rows.some(function (row) { return row.id === id; }));

      const suggestion = {
        id: id,
        guildId: i.guildId,
        userId: i.user.id,
        userTag: i.user.tag,
        text: text,
        status: "pending",
        upvotes: [],
        downvotes: [],
        createdAt: new Date().toISOString(),
        channelId: null,
        messageId: null
      };

      const configuredId = config.channels.suggestions;
      let channel = configuredId ? await i.guild.channels.fetch(configuredId).catch(function () { return null; }) : null;
      if (!channel || channel.type !== ChannelType.GuildText) channel = i.channel;

      try {
        const posted = await channel.send({
          embeds: [suggestionEmbed(suggestion)],
          components: suggestionButtons(suggestion),
          allowedMentions: { parse: [] }
        });
        suggestion.channelId = channel.id;
        suggestion.messageId = posted.id;
        rows.push(suggestion);
        writeJSON(FILE, rows.slice(-5000));
        return i.reply({
          content: "✅ Sugerencia registrada como #" + id + " en " + channel + ". La comunidad ya puede votar.",
          ephemeral: true
        });
      } catch (error) {
        console.error("No se pudo publicar la sugerencia:", error);
        return i.reply({ content: "❌ No pude publicarla. Comprueba que el bot pueda enviar mensajes y embeds.", ephemeral: true });
      }
    }

    const latest = rows.filter(function (row) {
      return row.guildId === i.guildId;
    }).slice(-10).reverse();

    if (!latest.length) return i.reply({ content: "Todavía no hay sugerencias en este servidor.", ephemeral: true });
    const embed = new EmbedBuilder().setColor(config.colors.primary)
      .setTitle("💡 Últimas sugerencias de FLUX STORE")
      .setDescription(latest.map(function (row) {
        const up = Array.isArray(row.upvotes) ? row.upvotes.length : 0;
        const down = Array.isArray(row.downvotes) ? row.downvotes.length : 0;
        const state = row.status === "approved" ? "Aprobada" : row.status === "rejected" ? "Rechazada" : "Pendiente";
        return "**#" + row.id + " · " + state + "** — 👍 " + up + " / 👎 " + down +
          "\n" + row.text.slice(0, 180).replace(/\n/g, " ");
      }).join("\n\n").slice(0, 4000));
    return i.reply({ embeds: [embed], ephemeral: true });
  }
};
