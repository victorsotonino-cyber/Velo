"use strict";
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("./config");
const REACTIONS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];
module.exports = {
  data: new SlashCommandBuilder()
    .setName("poll")
    .setDescription("Crea una encuesta con reacciones numeradas.")
    .addStringOption(o => o.setName("pregunta").setDescription("Pregunta de la encuesta").setRequired(true).setMaxLength(240))
    .addStringOption(o => o.setName("opcion1").setDescription("Primera opción").setRequired(true).setMaxLength(80))
    .addStringOption(o => o.setName("opcion2").setDescription("Segunda opción").setRequired(true).setMaxLength(80))
    .addStringOption(o => o.setName("opcion3").setDescription("Tercera opción (opcional)").setRequired(false).setMaxLength(80))
    .addStringOption(o => o.setName("opcion4").setDescription("Cuarta opción (opcional)").setRequired(false).setMaxLength(80))
    .addStringOption(o => o.setName("opcion5").setDescription("Quinta opción (opcional)").setRequired(false).setMaxLength(80)),
  async execute(i) {
    if (!i.guild) return i.reply({ content: "Las encuestas solo pueden crearse en un servidor.", ephemeral: true });
    const botMember = i.guild.members.me;
    const channelPermissions = i.channel.permissionsFor(botMember);
    if (!channelPermissions?.has(PermissionFlagsBits.ViewChannel) ||
        !channelPermissions?.has(PermissionFlagsBits.SendMessages) ||
        !channelPermissions?.has(PermissionFlagsBits.EmbedLinks) ||
        !channelPermissions?.has(PermissionFlagsBits.AddReactions)) {
      return i.reply({ content: "FLUX STORE necesita Ver canal, Enviar mensajes, Insertar enlaces y Añadir reacciones en este canal.", ephemeral: true });
    }
    const question = i.options.getString("pregunta").trim();
    const options = ["opcion1", "opcion2", "opcion3", "opcion4", "opcion5"]
      .map(name => i.options.getString(name)).filter(Boolean).map(value => value.trim()).filter(Boolean);
    if (options.length < 2) return i.reply({ content: "Indica al menos dos opciones distintas.", ephemeral: true });
    if (new Set(options.map(value => value.toLocaleLowerCase())).size !== options.length) {
      return i.reply({ content: "Las opciones deben ser distintas entre sí.", ephemeral: true });
    }
    const description = options.map((value, index) => REACTIONS[index] + " **" + value + "**").join("\n");
    const embed = new EmbedBuilder().setColor(config.colors.primary || 0x8B5CF6)
      .setTitle("📊 " + question).setDescription(description)
      .setAuthor({ name: "Encuesta de " + i.user.tag, iconURL: i.user.displayAvatarURL() })
      .setFooter({ text: "FLUX STORE • Reacciona para votar" }).setTimestamp();
    await i.deferReply();
    const message = await i.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
    try {
      for (const reaction of REACTIONS.slice(0, options.length)) await message.react(reaction);
    } catch (error) {
      console.error("No se pudieron añadir todas las reacciones de /poll:", error);
      return i.followUp({ content: "La encuesta se publicó, pero no pude añadir todas las reacciones. Revisa Añadir reacciones y los permisos de emojis.", ephemeral: true });
    }
    return message;
  }
};
