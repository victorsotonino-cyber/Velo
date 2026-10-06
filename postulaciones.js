const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require("discord.js");
const config = require("./config");
const { emoji } = require("./ui");
const fs = require("fs");
const path = require("path");

function questions() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, "postulaciones.json"), "utf8"));
    return Array.isArray(data.questions) ? data.questions : [];
  } catch {
    return [];
  }
}

function safeName(username, userId) {
  const safe = username.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 18);
  return "postulacion-" + (safe || userId);
}

async function openApplication(i) {
  if (!i.deferred && !i.replied) await i.deferReply({ ephemeral: true });

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

    if (old) {
      return i.editReply(emoji(i.guild, "info", "ℹ️") + " Ya tienes una postulación abierta: " + old);
    }

    if (!questions().length) {
      return i.editReply(emoji(i.guild, "error", "❌") + " No hay preguntas configuradas.");
    }

    const staff = i.guild.roles.cache.get(config.roles.staff);

    const ch = await i.guild.channels.create({
      name: safeName(i.user.username, i.user.id),
      type: ChannelType.GuildText,
      topic: "VeloApplication:" + i.user.id,
      parent: parent.id,
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
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory
          ]
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

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(emoji(i.guild, "edit", "✏️") + " Postulación — Velo Studio")
      .setDescription(
        "¡Hola " + i.user + "!\n\n" +
        "Este canal es **privado**. Pulsa **Comenzar** para responder las preguntas una por una.\n\n" +
        "Al finalizar, tus respuestas quedarán disponibles para que el Staff las revise."
      )
      .setFooter({ text: "Velo Studio • Sistema de postulaciones" });

    await ch.send({
      content: i.user + (staff ? " <@&" + staff.id + ">" : ""),
      embeds: [embed],
      components: [row]
    });

    return i.editReply(emoji(i.guild, "success", "✅") + " Tu postulación fue creada: " + ch);
  } catch (error) {
    console.error("Error creando postulación:", error);
    console.error("Código Discord:", error?.code, "Mensaje:", error?.message);
    const message = error?.code === 50013
      ? "❌ Discord rechazó la creación del canal por permisos. El bot necesita **Gestionar canales** y acceso a la categoría de tickets."
      : error?.code === 50001
        ? "❌ El bot no tiene acceso a la categoría de tickets."
        : "❌ No pude crear la postulación. Revisa los permisos del bot y la categoría de tickets.";
    return i.editReply(message).catch(() => {});
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("postulaciones")
    .setDescription("Abre una postulación privada para entrar al Staff."),
  async execute(i) {
    const memberRole = config.roles.member;
    if (
      memberRole &&
      !i.member.roles.cache.has(memberRole) &&
      !i.member.permissions.has(PermissionFlagsBits.ManageGuild)
    ) {
      return i.reply({
        content: emoji(i.guild, "error", "❌") + " Este comando es para miembros.",
        ephemeral: true
      });
    }

    return openApplication(i);
  }
};
