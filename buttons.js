const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const config = require("./config");
const { emoji } = require("./ui");

module.exports = client => {
  client.on("interactionCreate", async i => {
    try {
      if (i.isStringSelectMenu() && i.customId === "ticket_create") {
        const safe = i.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 20);
        const name = "ticket-" + (safe || i.user.id);

        const old = i.guild.channels.cache.find(c =>
          c.type === ChannelType.GuildText &&
          c.topic === "VeloTicket:" + i.user.id
        );
        if (old) return i.reply({ content: emoji(i.guild, "error", "❌") + " Ya tienes un ticket: " + old, ephemeral: true });

        const staffRole = i.guild.roles.cache.get(config.roles.staff);
        if (!staffRole) {
          return i.reply({ content: emoji(i.guild, "error", "❌") + " El rol de staff configurado no existe. Revisa config.js.", ephemeral: true });
        }

        const cat = i.guild.channels.cache.get(config.channels.tickets);
        const ch = await i.guild.channels.create({
          name,
          type: ChannelType.GuildText,
          topic: "VeloTicket:" + i.user.id,
          parent: cat?.type === ChannelType.GuildCategory ? cat.id : null,
          permissionOverwrites: [
            {
              id: i.guild.roles.everyone.id,
              deny: [PermissionFlagsBits.ViewChannel]
            },
            {
              id: i.guild.members.me.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory
              ]
            },
            {
              id: i.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory
              ]
            },
            { id: staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
          ]
        });

        const embed = new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle(emoji(i.guild, "ticket", "🎫") + " Ticket de Velo Studio")
          .setDescription("Hola " + i.user + ", explica tu problema aquí.\n\n**Tipo:** " + i.values[0]);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("ticket_close").setLabel("Cerrar").setEmoji(emoji(i.guild, "lock", "🔒")).setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("ticket_lock").setLabel("Bloquear usuario").setEmoji(emoji(i.guild, "error", "🚫")).setStyle(ButtonStyle.Secondary)
        );

        await ch.send({ content: i.user + " <@&" + staffRole.id + ">", embeds: [embed], components: [row] });
        return i.reply({ content: emoji(i.guild, "success", "✅") + " Ticket creado: " + ch, ephemeral: true });
      }

      if (i.isButton() && i.customId === "ticket_close") {
        if (!i.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
          return i.reply({ content: emoji(i.guild, "error", "❌") + " Sin permisos.", ephemeral: true });
        }
        await i.reply(emoji(i.guild, "lock", "🔒") + " Ticket cerrado. Se eliminará en 5 segundos.");
        setTimeout(() => i.channel.delete("Ticket cerrado").catch(() => {}), 5000);
        return;
      }

      if (i.isButton() && i.customId === "ticket_lock") {
        if (!i.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
          return i.reply({ content: emoji(i.guild, "error", "❌") + " Sin permisos.", ephemeral: true });
        }

        const creatorId = i.channel.topic?.startsWith("VeloTicket:")
          ? i.channel.topic.slice("VeloTicket:".length)
          : null;

        if (creatorId) await i.channel.permissionOverwrites.edit(creatorId, { SendMessages: false });
        await i.reply(emoji(i.guild, "lock", "🚫") + " Usuario del ticket bloqueado.");
        return;
      }

      if (i.isButton() && i.customId === "application_panel_open") {
        if (!i.deferred && !i.replied) await i.deferReply({ ephemeral: true });
        return createApplicationFromButton(i);
      }

      if (i.isButton() && i.customId === "application_start") {
        const questions = applicationQuestions();

        if (!questions.length) {
          return i.reply({
            content: emoji(i.guild, "error", "❌") + " No hay preguntas configuradas.",
            ephemeral: true
          });
        }

        const ownerId = i.channel.topic?.startsWith("VeloApplication:")
          ? i.channel.topic.slice("VeloApplication:".length)
          : null;

        if (ownerId && ownerId !== i.user.id && !i.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
          return i.reply({
            content: emoji(i.guild, "error", "❌") + " Solo la persona que abrió esta postulación puede comenzar.",
            ephemeral: true
          });
        }

        applicationAnswers.set(i.channel.id, {
          userId: ownerId || i.user.id,
          index: 0,
          answers: []
        });

        return showApplicationQuestion(i, questions, 0);
      }

      if (i.isModalSubmit() && i.customId.startsWith("application_answer_")) {
        const state = applicationAnswers.get(i.channel.id);

        if (!state || state.userId !== i.user.id) {
          return i.reply({
            content: emoji(i.guild, "error", "❌") + " Esta postulación no está activa para ti.",
            ephemeral: true
          });
        }

        const questions = applicationQuestions();
        const questionNumber = Number(i.customId.split("_").pop());

        if (!Number.isInteger(questionNumber) || questionNumber !== state.index || questionNumber >= questions.length) {
          return i.reply({
            content: emoji(i.guild, "error", "❌") + " Esta pregunta ya no está disponible. Pulsa **Comenzar** para reiniciar.",
            ephemeral: true
          });
        }

        state.answers.push(i.fields.getTextInputValue("answer").trim());
        state.index++;

        if (state.index < questions.length) {
          applicationAnswers.set(i.channel.id, state);
          return showApplicationQuestion(i, questions, state.index);
        }

        const embed = new EmbedBuilder()
          .setColor(config.colors.success)
          .setTitle(emoji(i.guild, "success", "✅") + " Postulación completada")
          .setDescription(
            "La postulación de " + i.user +
            " fue completada correctamente. El Staff puede revisarla y tomar una decisión."
          );

        questions.forEach((question, n) => {
          embed.addFields({
            name: (n + 1) + ". " + question.slice(0, 250),
            value: state.answers[n]?.slice(0, 1024) || "Sin respuesta"
          });
        });

        const close = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("application_close")
            .setLabel("Cerrar postulación")
            .setStyle(ButtonStyle.Danger)
            .setEmoji(emoji(i.guild, "trash", "🗑️"))
        );

        applicationAnswers.delete(i.channel.id);

        await i.reply({
          content: i.user + (config.roles.staff ? " <@&" + config.roles.staff + ">" : ""),
          embeds: [embed],
          components: [close]
        });
        return;
      }

      if (i.isButton() && i.customId === "application_close") {
        if (!i.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
          return i.reply({
            content: emoji(i.guild, "error", "❌") + " Sin permisos.",
            ephemeral: true
          });
        }

        await i.reply(emoji(i.guild, "trash", "🗑️") + " Postulación cerrada. Se eliminará en 5 segundos.");
        setTimeout(() => i.channel.delete("Postulación cerrada").catch(() => {}), 5000);
        return;
      }

      if (i.isStringSelectMenu() && i.customId === "help_category") {
        const text = {
          utilidad: emoji(i.guild, "info", "🧰") + " **Utilidad**\n/ping /avatar /serverinfo /anuncio /say",
          moderacion: emoji(i.guild, "moderation", "🛡️") + " **Moderación**\n/ban /kick /timeout /untimeout /warn /unban /clear /lock /unlock /slowmode",
          tickets: emoji(i.guild, "ticket", "🎫") + " **Tickets**\n/ticket-panel /ticket-config /ticket-edit /postulaciones",
          servidor: emoji(i.guild, "channel", "🏠") + " **Servidor**\n/serverinfo",
          diversion: emoji(i.guild, "fun", "🎮") + " **Diversión**\nPróximamente.",
          configuracion: emoji(i.guild, "settings", "⚙️") + " **Configuración**\n/ticket-config /ticket-edit /emoji-pack /postulaciones-panel /postulaciones-config"
        }[i.values[0]] || "Sin información.";
        return i.reply({ content: text, ephemeral: true });
      }
    } catch (e) {
      console.error("Error en interacción:", e);

      if (!i.replied && !i.deferred) {
        await i.reply({
          content: emoji(i.guild, "error", "❌") + " No pude completar esa acción. Revisa los permisos del bot.",
          ephemeral: true
        }).catch(() => {});
      } else if (i.deferred) {
        await i.editReply(
          emoji(i.guild, "error", "❌") + " No pude completar esa acción. Revisa los permisos del bot."
        ).catch(() => {});
      }
    }
  });
};

const fs = require("fs");
const path = require("path");
const applicationAnswers = new Map();

function applicationQuestions() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, "postulaciones.json"), "utf8"));
    return Array.isArray(data.questions) ? data.questions : [];
  } catch {
    return [];
  }
}

function makeQuestionModal(questions, number) {
  const question = questions[number];

  return new ModalBuilder()
    .setCustomId("application_answer_" + number)
    .setTitle("Postulación — Pregunta " + (number + 1))
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("answer")
          .setLabel("Tu respuesta")
          .setPlaceholder(question.slice(0, 100))
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
      )
    );
}

function showApplicationQuestion(i, questions, number) {
  const question = questions[number];

  const modal = makeQuestionModal(questions, number);

  return i.showModal(modal);
}

async function createApplicationFromButton(i) {
  try {
    const me = i.guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      return i.editReply(emoji(i.guild, "error", "❌") + " El bot necesita **Gestionar canales** para crear la postulación.");
    }

    const parent = i.guild.channels.cache.get(config.channels.tickets);
    if (!parent || parent.type !== ChannelType.GuildCategory) {
      return i.editReply(emoji(i.guild, "error", "❌") + " La categoría de tickets configurada no existe o no es una categoría.");
    }

    const old = i.guild.channels.cache.find(c =>
      c.type === ChannelType.GuildText &&
      c.topic === "VeloApplication:" + i.user.id
    );

    if (old) return i.editReply(emoji(i.guild, "info", "ℹ️") + " Ya tienes una postulación abierta: " + old);

    if (!applicationQuestions().length) {
      return i.editReply(emoji(i.guild, "error", "❌") + " No hay preguntas configuradas.");
    }

    const staff = i.guild.roles.cache.get(config.roles.staff);
    const safe = i.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 18) || i.user.id;

    const ch = await i.guild.channels.create({
      name: "postulacion-" + safe,
      type: ChannelType.GuildText,
      topic: "VeloApplication:" + i.user.id,
      parent: parent?.type === ChannelType.GuildCategory ? parent.id : null,
      permissionOverwrites: [
        {
          id: i.guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel]
        },
        {
          id: i.guild.members.me.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        },
        {
          id: i.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
        },
        ...(staff ? [{
          id: staff.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
        }] : [])
      ]
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("application_start")
        .setLabel("Comenzar")
        .setStyle(ButtonStyle.Primary)
        .setEmoji(emoji(i.guild, "edit", "✏️"))
    );

    await ch.send({
      content: i.user + (staff ? " <@&" + staff.id + ">" : ""),
      embeds: [
        new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle(emoji(i.guild, "edit", "✏️") + " Postulación — Velo Studio")
          .setDescription(
            "¡Hola " + i.user + "!\n\n" +
            "Este canal es **privado**. Pulsa **Comenzar** para responder las preguntas una por una.\n\n" +
            "Al finalizar, tus respuestas quedarán disponibles para que el Staff las revise."
          )
          .setFooter({ text: "Velo Studio • Sistema de postulaciones" })
      ],
      components: [row]
    });

    return i.editReply(emoji(i.guild, "success", "✅") + " Tu postulación fue creada: " + ch);
  } catch (error) {
    console.error("Error creando postulación desde panel:", error);

    console.error("Código Discord:", error?.code, "Mensaje:", error?.message);
    const message = error?.code === 50013
      ? "❌ Discord rechazó la creación del canal por permisos. El bot necesita **Gestionar canales** y acceso a la categoría de tickets."
      : error?.code === 50001
        ? "❌ El bot no tiene acceso a la categoría de tickets."
        : "❌ No pude crear la postulación. Revisa los permisos del bot y la categoría de tickets.";

    return i.editReply(message).catch(() => {});
  }
}
