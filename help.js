const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const config = require("./config");
const { emoji, emojiData } = require("./ui");

module.exports = {
  data: new SlashCommandBuilder().setName("help").setDescription("Muestra la ayuda y categorías de comandos."),
  async execute(i, client) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("help_category")
      .setPlaceholder("Selecciona una categoría")
      .addOptions(
        { label: "Comunidad", value: "comunidad", emoji: emojiData(i.guild, "users", "👥"), description: "Bienvenida, actividad y herramientas sociales" },
        { label: "Administración", value: "administracion", emoji: emojiData(i.guild, "settings", "⚙️"), description: "Gestión del servidor y canales" },
        { label: "Moderación", value: "moderacion", emoji: emojiData(i.guild, "moderation", "🛡️"), description: "Sanciones y control del chat" },
        { label: "Tickets", value: "tickets", emoji: emojiData(i.guild, "ticket", "🎫"), description: "Tickets y postulaciones" },
        { label: "Utilidad", value: "utilidad", emoji: emojiData(i.guild, "info", "🧰"), description: "Comandos útiles" },
        { label: "Diversión", value: "diversion", emoji: emojiData(i.guild, "fun", "🎮"), description: "Comandos para la comunidad" }
      );

    const commands = client?.commands ? [...client.commands.keys()] : [];
    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(emoji(i.guild, "brand", "✨") + " Velo Studio — Centro de comandos")
      .setDescription("Selecciona **Comunidad** o **Administración** para ver sus comandos. Los comandos disponibles también aparecen en la lista de abajo.")
      .addFields({ name: "Comandos slash cargados", value: commands.length ? commands.map(n => "`/" + n + "`").join(" • ").slice(0, 1024) : "No se pudo obtener la lista de comandos." })
      .setFooter({ text: "Velo Studio • Usa /comandos para consultar las funciones disponibles" });

    await i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
  }
};
