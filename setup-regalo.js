const {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType,
  ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require("discord.js");
const config = require("./config");
const { readJSON, writeJSON } = require("./storage");

function canSetup(i) {
  return i.inGuild() && i.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("setup-regalo")
    .setDescription("Configura rápidamente los sistemas del bot de NOVYZ Market.")
    .addSubcommand(s => s.setName("bienvenida").setDescription("Publica una prueba de bienvenida").addChannelOption(o => o.setName("canal").setDescription("Canal de bienvenida").addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand(s => s.setName("stats").setDescription("Crea canales de estadísticas del servidor"))
    .addSubcommand(s => s.setName("logs").setDescription("Configura el canal de registros").addChannelOption(o => o.setName("canal").setDescription("Canal de registros").addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand(s => s.setName("ayuda").setDescription("Publica un panel de ayuda"))
    .addSubcommand(s => s.setName("todo").setDescription("Publica un resumen de los sistemas disponibles"))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(i) {
    if (!canSetup(i)) return i.reply({ content: "Necesitas el permiso Gestionar servidor.", ephemeral: true });
    const sub = i.options.getSubcommand();
    if (sub === "bienvenida") {
      const channel = i.options.getChannel("canal", true);
      const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle("👋 Bienvenido/a a NOVYZ Market")
        .setDescription("¡Hola! Gracias por unirte a nuestra comunidad. Lee las reglas y abre un ticket si necesitas ayuda.")
        .setThumbnail(i.guild.iconURL({ size: 256 }) || null)
        .addFields({ name: "Miembros", value: String(i.guild.memberCount), inline: true })
        .setFooter({ text: "NOVYZ Market • Comunidad y tienda" });
      await channel.send({ embeds: [embed] });
      return i.reply({ content: "Mensaje de bienvenida de prueba publicado en " + channel + ".", ephemeral: true });
    }
    if (sub === "stats") {
      await i.deferReply({ ephemeral: true });
      const existing = i.guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === "📊 estadísticas");
      const category = existing || await i.guild.channels.create({ name: "📊 Estadísticas", type: ChannelType.GuildCategory });
      const specs = [
        { name: "👥 miembros", value: () => "Miembros: " + i.guild.memberCount },
        { name: "🤖 bots", value: () => "Bots: " + i.guild.members.cache.filter(m => m.user.bot).size }
      ];
      const created = [];
      for (const spec of specs) {
        let channel = i.guild.channels.cache.find(c => c.parentId === category.id && c.name.startsWith(spec.name));
        if (!channel) channel = await i.guild.channels.create({ name: spec.name, type: ChannelType.GuildVoice, parent: category.id, permissionOverwrites: [{ id: i.guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }] });
        await channel.setName(spec.name + "・" + (spec.name.includes("miembros") ? i.guild.memberCount : i.guild.members.cache.filter(m => m.user.bot).size)).catch(() => {});
        created.push(channel.name);
      }
      return i.editReply("Canales de estadísticas creados/actualizados: " + created.join(", ") + ". Necesito acceso a la lista de miembros para contar bots con precisión.");
    }
    if (sub === "logs") {
      const channel = i.options.getChannel("canal", true);
      const row = { channelId: channel.id, configuredAt: new Date().toISOString() };
      const file = "noyvz-guild-config.json";
      const all = readJSON(file, {});
      all[i.guildId] = { ...(all[i.guildId] || {}), logsChannelId: row.channelId };
      writeJSON(file, all);
      return i.reply({ content: "Canal de registros guardado: " + channel + ". Los módulos que emitan logs deberán usar esta configuración.", ephemeral: true });
    }
    const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle(sub === "todo" ? "⚙️ Sistemas de NOVYZ Market" : "📘 Ayuda de NOVYZ Market")
      .setDescription("Usa los comandos slash para configurar los sistemas disponibles. El bot incluye tienda, pedidos, tickets, moderación, sorteos, postulaciones, sugerencias, verificación y herramientas de comunidad.")
      .addFields(
        { name: "Tienda", value: "`/tienda` • `/carrito` • `/pedidos` • `/ventas` • `/resena`", inline: false },
        { name: "Tickets y comunidad", value: "`/ticket-panel` • `/postulaciones-panel` • `/sugerencia` • `/reglas-panel` • `/verificacion-panel`", inline: false },
        { name: "Moderación", value: "`/ban` • `/kick` • `/timeout` • `/warn` • `/lock` • `/clear`", inline: false }
      ).setFooter({ text: "NOVYZ Market • Configuración de servidor" });
    await i.channel.send({ embeds: [embed] });
    return i.reply({ content: "Panel publicado en este canal.", ephemeral: true });
  }
};
