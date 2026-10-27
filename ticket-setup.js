const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
  PermissionFlagsBits
} = require("discord.js");
const config = require("./config");
const { hasPermission, hasConfiguredRole } = require("./utils/permissions");
const { readJSON } = require("./storage");

function isAdmin(member) {
  return hasPermission(member, PermissionFlagsBits.Administrator) ||
    hasConfiguredRole(member, [config.roles.admin]);
}

function getSaved(guildId) {
  const store = readJSON("ticket-config.json", {});
  return store && typeof store === "object" ? (store[guildId] || {}) : {};
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket-setup")
    .setDescription("Abre el configurador interactivo del sistema de tickets.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: "Este comando solo se puede usar dentro de un servidor.", ephemeral: true });
    }
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ content: "❌ Solo administradores pueden configurar el sistema de tickets.", ephemeral: true });
    }

    const saved = getSaved(interaction.guildId);
    const embed = new EmbedBuilder()
      .setColor(config.colors?.primary || 0x8B5CF6)
      .setAuthor({ name: "NOVYZ Market • Sistema de soporte" })
      .setTitle("🎫 Configuración de tickets")
      .setDescription([
        "Configura el sistema desde estos selectores y después publica el panel.",
        "",
        "**1. Canal público:** dónde aparecerá el panel para abrir tickets.",
        "**2. Roles de soporte:** quién podrá atenderlos.",
        "**3. Categoría:** dónde se crearán los canales privados.",
        "",
        "**Configuración actual**",
        "Canal del panel: " + (saved.panelChannelId ? "<#" + saved.panelChannelId + ">" : "Sin configurar"),
        "Roles de soporte: " + ((saved.supportRoleIds || []).map(id => "<@&" + id + ">").join(", ") || "Sin configurar"),
        "Categoría: " + (saved.ticketCategoryId ? "<#" + saved.ticketCategoryId + ">" : "Sin configurar"),
        "",
        "Al terminar, pulsa **Publicar panel**. Usa **Ajustes avanzados** para editar apariencia, categorías, transcripciones y otras opciones."
      ].join("\n"))
      .setFooter({ text: "NOVYZ Market • Los cambios se guardan al seleccionar cada opción" });

    const channelMenu = new ChannelSelectMenuBuilder()
      .setCustomId("flux_ticket_config:panel_channel")
      .setPlaceholder("01 · Selecciona el canal público del panel")
      .setChannelTypes(ChannelType.GuildText)
      .setMinValues(1).setMaxValues(1);
    const roleMenu = new RoleSelectMenuBuilder()
      .setCustomId("flux_ticket_config:support_roles")
      .setPlaceholder("02 · Selecciona los roles de soporte")
      .setMinValues(1).setMaxValues(5);
    const categoryMenu = new ChannelSelectMenuBuilder()
      .setCustomId("flux_ticket_config:ticket_category")
      .setPlaceholder("03 · Selecciona la categoría de tickets")
      .setChannelTypes(ChannelType.GuildCategory)
      .setMinValues(1).setMaxValues(1);
    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("flux_ticket_config:create_panel")
        .setLabel("Publicar panel")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId("flux_ticket_config:advanced")
        .setLabel("Ajustes avanzados")
        .setStyle(ButtonStyle.Primary)
    );

    await interaction.reply({
      embeds: [embed],
      components: [
        new ActionRowBuilder().addComponents(channelMenu),
        new ActionRowBuilder().addComponents(roleMenu),
        new ActionRowBuilder().addComponents(categoryMenu),
        buttons
      ],
      ephemeral: true,
      allowedMentions: { parse: [] }
    });
  }
};
