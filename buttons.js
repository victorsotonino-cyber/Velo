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
            { id: i.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
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
        return createApplication(i);
      }

      if (i.isButton() && i.customId === "application_start") {
        const questions = applicationQuestions();
        if (!questions.length) return i.reply({ content: emoji(i.guild, "error", "❌") + " No hay preguntas configuradas.", ephemeral: true });
        applicationAnswers.set(i.channel.id, { userId: i.user.id, index: 0, answers: [] });
        const modal = new ModalBuilder().setCustomId("application_answer_0").setTitle("Postulación — Pregunta 1");
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("answer").setLabel(questions[0].slice(0,45)).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)));
        return i.showModal(modal);
      }

      if (i.isModalSubmit() && i.customId.startsWith("application_answer_")) {
        const state = applicationAnswers.get(i.channel.id);
        if (!state || state.userId !== i.user.id) return i.reply({ content: emoji(i.guild, "error", "❌") + " Esta postulación no está activa para ti.", ephemeral: true });
        const questions = applicationQuestions();
        const answer = i.fields.getTextInputValue("answer");
        state.answers.push(answer);
        state.index++;
        if (state.index < questions.length) {
          const n = state.index;
          const modal = new ModalBuilder().setCustomId("application_answer_" + n).setTitle("Postulación — Pregunta " + (n + 1));
          modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("answer").setLabel(questions[n].slice(0,45)).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)));
          applicationAnswers.set(i.channel.id, state);
          return i.showModal(modal);
        }
        const embed = new EmbedBuilder().setColor(config.colors.success).setTitle(emoji(i.guild, "success", "✅") + " Postulación completada").setDescription("La postulación de " + i.user + " ha sido completada. El Staff puede revisarla.");
        questions.forEach((q,n)=>embed.addFields({name:(n+1)+". "+q.slice(0,250),value:state.answers[n]?.slice(0,1024)||"Sin respuesta"}));
        const close = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("application_close").setLabel("Cerrar postulación").setStyle(ButtonStyle.Danger).setEmoji(emoji(i.guild,"trash","🗑️")));
        applicationAnswers.delete(i.channel.id);
        await i.reply({content: i.user+" <@&"+config.roles.staff+">",embeds:[embed],components:[close]});
        return;
      }

      if (i.isButton() && i.customId === "application_close") {
        if (!i.member.permissions.has(PermissionFlagsBits.ManageChannels)) return i.reply({content:emoji(i.guild,"error","❌")+" Sin permisos.",ephemeral:true});
        await i.reply(emoji(i.guild,"trash","🗑️")+" Postulación cerrada. Se eliminará en 5 segundos.");
        setTimeout(()=>i.channel.delete("Postulación cerrada").catch(()=>{}),5000);
        return;
      }

      if (i.isStringSelectMenu() && i.customId === "help_category") {
        const text = {
          utilidad: emoji(i.guild, "info", "🧰") + " **Utilidad**\n/ping /avatar /serverinfo /anuncio",
          moderacion: emoji(i.guild, "moderation", "🛡️") + " **Moderación**\n/ban /kick /timeout /clear",
          tickets: emoji(i.guild, "ticket", "🎫") + " **Tickets**\n/ticket-panel /ticket-config /ticket-edit",
          servidor: emoji(i.guild, "channel", "🏠") + " **Servidor**\n/serverinfo",
          diversion: emoji(i.guild, "fun", "🎮") + " **Diversión**\nPróximamente.",
          configuracion: emoji(i.guild, "settings", "⚙️") + " **Configuración**\n/ticket-config /ticket-edit /emoji-pack"
        }[i.values[0]] || "Sin información.";
        return i.reply({ content: text, ephemeral: true });
      }
    } catch (e) {
      console.error("Error en interacción:", e);
      if (!i.replied && !i.deferred) {
        await i.reply({ content: emoji(i.guild, "error", "❌") + " No pude completar esa acción. Revisa los permisos del bot.", ephemeral: true }).catch(() => {});
      }
    }
  });
};


// Sistema de postulaciones: respuestas paso a paso
const fs = require("fs");
const path = require("path");
const applicationAnswers = new Map();

function applicationQuestions() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, "postulaciones.json"), "utf8")).questions || []; }
  catch { return []; }
}

async function createApplication(i) {
  const old = i.guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.topic === "VeloApplication:" + i.user.id);
  if (old) return i.reply({ content: emoji(i.guild, "info", "ℹ️") + " Ya tienes una postulación abierta: " + old, ephemeral: true });
  const staff = i.guild.roles.cache.get(config.roles.staff);
  const parent = i.guild.channels.cache.get(config.channels.tickets);
  const safe = i.user.username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 18) || i.user.id;
  const ch = await i.guild.channels.create({
    name: "postulacion-" + safe,
    type: ChannelType.GuildText,
    topic: "VeloApplication:" + i.user.id,
    parent: parent?.type === ChannelType.GuildCategory ? parent.id : null,
    permissionOverwrites: [
      { id: i.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: i.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ...(staff ? [{ id: staff.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : [])
    ]
  });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("application_start").setLabel("Comenzar").setStyle(ButtonStyle.Primary).setEmoji(emoji(i.guild, "edit", "✏️"))
  );
  await ch.send({ content: i.user + (staff ? " <@&" + staff.id + ">" : ""), embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle(emoji(i.guild, "edit", "✏️") + " Postulación").setDescription("Bienvenido/a. Pulsa **Comenzar** y responde las preguntas una por una.")], components: [row] });
  return i.reply({ content: emoji(i.guild, "success", "✅") + " Tu postulación fue creada: " + ch, ephemeral: true });
}
