const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder
} = require("discord.js");
const config = require("./config");
const { readJSON, writeJSON } = require("./storage");
const ADVANCED_OPTIONS = [
  { label: "⭐ Panel", value: "panel", description: "Canal y aspecto del panel" },
  { label: "🛡️ Roles y categorías", value: "roles", description: "Roles de soporte y categoría de tickets" },
  { label: "🏷️ Nombres de canales", value: "names", description: "Plantillas con {username}, {ticket} y {type}" },
  { label: "💬 Opiniones", value: "reviews", description: "Canal de opiniones y vouches" },
  { label: "📑 Transcripts", value: "transcripts", description: "Canal, DM o ambos" },
  { label: "👥 Clientes", value: "clients", description: "Rol de cliente" },
  { label: "🛒 Catálogo y precios", value: "catalog", description: "Usa el catálogo existente de Flux STORE" },
  { label: "🔢 Cantidades", value: "quantities", description: "Límites de tickets abiertos" },
  { label: "💳 Métodos de pago", value: "payments", description: "LTC, Binance, bancos y PayPal" },
  { label: "🛠️ Sellers / Limpieza / Emojis", value: "tools", description: "Opciones de staff y vista previa de emojis" },
  { label: "🎨 Apariencia del panel y tickets", value: "panel_editor", description: "Título, texto, nombres, emojis y categorías" },
  { label: "🛡️ Moderación de tickets", value: "moderation", description: "Límites, recordatorios y autocierre" },
];

function readStore() {
  const parsed = readJSON("ticket-config.json", {});
  return parsed && typeof parsed === "object" ? parsed : {};
}

function writeStore(store) {
  writeJSON("ticket-config.json", store);
}

function guildConfig(guildId) {
  const store = readStore();
  if (!store[guildId]) {
    store[guildId] = {
      panelChannelId: null,
      supportRoleIds: [],
      ticketCategoryId: config.channels.tickets || null,
      transcriptMode: "channel",
      clientRoleId: null,
      reviewsChannelId: config.channels.reviews || null,
      channelNameTemplate: "ticket-{type}-{username}",
      maxOpenPerUser: config.ticket.maxOpenPerUser || 2,
      paymentMethods: ["LTC", "Binance", "Banks", "PayPal"]
    };
    writeStore(store);
  }
  return store[guildId];
}

function updateGuild(guildId, updater) {
  const store = readStore();
  const current = store[guildId] || {
    panelChannelId: null, supportRoleIds: [], ticketCategoryId: config.channels.tickets || null,
    transcriptMode: "channel", clientRoleId: null, reviewsChannelId: config.channels.reviews || null,
    channelNameTemplate: "ticket-{type}-{username}", maxOpenPerUser: config.ticket.maxOpenPerUser || 2,
    paymentMethods: ["LTC", "Binance", "Banks", "PayPal"]
  };
  updater(current);
  store[guildId] = current;
  writeStore(store);
  return current;
}

function isAdmin(member) {
  return Boolean(member && (member.permissions.has(PermissionFlagsBits.Administrator) ||
    (config.roles.admin && member.roles.cache.has(config.roles.admin))));
}

function mainEmbed(guild, saved) {
  const channel = saved.panelChannelId ? guild.channels.cache.get(saved.panelChannelId) : null;
  const category = saved.ticketCategoryId ? guild.channels.cache.get(saved.ticketCategoryId) : null;
  const roles = (saved.supportRoleIds || []).map(id => guild.roles.cache.get(id)).filter(Boolean);
  const modeLabels = { channel: "Canal de registros", dm: "Mensaje privado", both: "Canal + mensaje privado" };
  const requiredReady = [Boolean(channel), roles.length > 0, Boolean(category && category.type === ChannelType.GuildCategory)]
    .filter(Boolean).length;
  const iconURL = guild.iconURL({ size: 128 });

  const embed = new EmbedBuilder()
    .setColor(config.colors.primary || 0x8B5CF6)
    .setTitle("Centro de configuración")
    .setDescription([
      "Administra el sistema de atención de **FLUX STORE** desde esta consola. Los ajustes se guardan para este servidor.",
      "",
      "**ESTADO DE PUESTA EN MARCHA**",
      "`" + requiredReady + "/3` requisitos principales completados.",
      (channel ? "✅" : "◻️") + " **01 · Canal del panel** — " + (channel ? "configurado" : "pendiente"),
      (roles.length ? "✅" : "◻️") + " **02 · Equipo de soporte** — " + (roles.length ? roles.length + " rol(es) asignado(s)" : "pendiente"),
      (category && category.type === ChannelType.GuildCategory ? "✅" : "◻️") + " **03 · Categoría de tickets** — " + (category ? "configurada" : "pendiente"),
      "",
      "**ORDEN RECOMENDADO**",
      "Selecciona el canal público, asigna los roles que atenderán las solicitudes y elige la categoría donde se crearán los canales privados. Después pulsa **Publicar panel**.",
      "",
      "Los controles administrativos están restringidos a administradores o al rol administrador configurado."
    ].join("\n"))
    .addFields(
      {
        name: "📨 Canal de publicación",
        value: channel ? channel.toString() + "\n✅ Listo" : "⚠️ Selecciona el canal donde los miembros abrirán solicitudes.",
        inline: true
      },
      {
        name: "🛡️ Equipo responsable",
        value: roles.length ? roles.map(role => role.toString()).join(", ") : "⚠️ Selecciona de 1 a 5 roles de soporte.",
        inline: true
      },
      {
        name: "🗂️ Categoría de Discord",
        value: category ? category.toString() + "\n✅ Los tickets se crearán aquí." : "⚠️ Selecciona la categoría donde se crearán los tickets.",
        inline: true
      },
      {
        name: "🧾 Transcripciones",
        value: modeLabels[saved.transcriptMode || "channel"] || "Canal de registros",
        inline: true
      },
      {
        name: "🔢 Límite por miembro",
        value: String(saved.maxOpenPerUser || 2) + " ticket(s) abiertos",
        inline: true
      },
      {
        name: "⏱️ Automatización",
        value: saved.autoCloseEnabled
          ? "Autocierre activado · " + String(saved.autoCloseHours || 24) + " h"
          : "Autocierre desactivado por seguridad",
        inline: true
      }
    )
    .setFooter({ text: "FLUX STORE • Consola administrativa • Guardado automático" })
    .setTimestamp();

  if (iconURL) embed.setAuthor({ name: "FLUX STORE  /  SISTEMA DE SOPORTE", iconURL });
  else embed.setAuthor({ name: "FLUX STORE  /  SISTEMA DE SOPORTE" });
  return embed;
}

function mainComponents() {
  const channelMenu = new ChannelSelectMenuBuilder()
    .setCustomId("flux_ticket_config:panel_channel")
    .setPlaceholder("01 · Selecciona el canal público del panel")
    .setChannelTypes(ChannelType.GuildText)
    .setMinValues(1).setMaxValues(1);
  const roleMenu = new RoleSelectMenuBuilder()
    .setCustomId("flux_ticket_config:support_roles")
    .setPlaceholder("02 · Selecciona los roles que atenderán tickets")
    .setMinValues(1).setMaxValues(5);
  const categoryMenu = new ChannelSelectMenuBuilder()
    .setCustomId("flux_ticket_config:ticket_category")
    .setPlaceholder("03 · Selecciona dónde se crearán los tickets")
    .setChannelTypes(ChannelType.GuildCategory)
    .setMinValues(1).setMaxValues(1);
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("flux_ticket_config:create_panel").setLabel("Publicar panel").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("flux_ticket_config:advanced").setLabel("Ajustes avanzados").setStyle(ButtonStyle.Primary)
  );
  return [
    new ActionRowBuilder().addComponents(channelMenu),
    new ActionRowBuilder().addComponents(roleMenu),
    new ActionRowBuilder().addComponents(categoryMenu),
    buttons
  ];
}

function advancedComponents() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId("flux_ticket_config:advanced_select")
    .setPlaceholder("Selecciona un módulo de configuración")
    .addOptions(ADVANCED_OPTIONS);
  const back = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("flux_ticket_config:back").setLabel("Volver al panel principal").setStyle(ButtonStyle.Secondary)
  );
  return [new ActionRowBuilder().addComponents(menu), back];
}

function advancedDescription(key, saved, guild) {
  const details = {
    panel: "Panel: " + (saved.panelChannelId ? "<#" + saved.panelChannelId + ">" : "sin configurar") + ". Selecciona el canal en el menú principal.",
    roles: "Roles: " + ((saved.supportRoleIds || []).map(id => "<@&" + id + ">").join(", ") || "sin configurar") +
      "\nCategoría: " + (saved.ticketCategoryId ? "<#" + saved.ticketCategoryId + ">" : "sin configurar") + ". Usa los selectores del menú principal.",
    names: "Plantilla actual: `" + (saved.channelNameTemplate || "ticket-{type}-{username}") + "`\nVariables disponibles: `{username}`, `{ticket}`, `{type}`. La plantilla queda guardada para futuras integraciones de creación de canales.",
    reviews: "Canal de opiniones configurado: " + (saved.reviewsChannelId ? "<#" + saved.reviewsChannelId + ">" : "usa REVIEWS_CHANNEL_ID en el entorno") + ".",
    transcripts: "Modo actual: **" + (saved.transcriptMode || "channel") + "**. Elige el modo:",
    clients: "Rol de cliente actual: " + (saved.clientRoleId ? "<@&" + saved.clientRoleId + ">" : "no configurado") + ". Se puede seleccionar con el menú de roles del panel principal.",
    catalog: "El catálogo y los precios usan el sistema existente de Flux STORE. Comandos disponibles: `!tienda catalogo`, `!tienda agregar`, `!tienda editar` y `!tienda eliminar`.",
    quantities: "Máximo de tickets abiertos por usuario: **" + (saved.maxOpenPerUser || 2) + "**. Valor inicial heredado de la configuración del bot.",
    payments: "Métodos guardados: " + ((saved.paymentMethods || []).join(", ") || "ninguno") + ". La lista es de configuración; no procesa pagos automáticamente.",
    tools: "Roles de soporte: " + ((saved.supportRoleIds || []).map(id => "<@&" + id + ">").join(", ") || "sin configurar") +
      "\nEmojis disponibles en el servidor: " + guild.emojis.cache.size + ".",
    panel_editor: "Título: **" + (saved.panelTitle || "FLUX STORE • Centro de atención") + "**\nColor: **" + (saved.panelColor || "#8B5CF6") + "**\nTexto del selector: **" + (saved.panelPlaceholder || "Selecciona el motivo de tu solicitud") + "**\nPlantilla de canal: " + (saved.channelNameTemplate || "ticket-{type}-{username}") + "\nDesde este módulo puedes editar el título, la descripción, el nombre y el emoji de cada tipo de ticket.",
    moderation: "Máximo de tickets abiertos por usuario: **" + (saved.maxOpenPerUser || 2) + "**\nAutocierre: **" + (saved.autoCloseEnabled ? "activado" : "desactivado") + "**\nHoras de inactividad: **" + (saved.autoCloseHours || 24) + "**\nRecordatorio al staff: **" + (saved.staffReminderHours || 4) + " h**"
  };
  return details[key] || "Opción de configuración no reconocida.";
}

function panelEditorModal(saved) {
  const modal = new ModalBuilder().setCustomId("flux_ticket_config:save_panel_editor").setTitle("Editar panel de tickets");
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("panel_title").setLabel("Título del panel").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(256).setValue(String(saved.panelTitle || "✦ FLUX STORE • Centro de atención").slice(0, 256))),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("panel_description").setLabel("Descripción del panel").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1400).setValue(String(saved.panelDescription || "Selecciona el tipo de solicitud para abrir un ticket privado.").slice(0, 1400))),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("panel_color").setLabel("Color hexadecimal (ej. #8B5CF6)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(7).setValue(String(saved.panelColor || "#8B5CF6"))),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("panel_footer").setLabel("Texto del pie").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setValue(String(saved.panelFooter || "FLUX STORE • Soporte privado").slice(0, 100))),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("panel_placeholder").setLabel("Texto del selector de tickets").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setValue(String(saved.panelPlaceholder || "Selecciona el motivo de tu solicitud").slice(0, 100)))
  );
  return modal;
}

function moderationModal(saved) {
  const modal = new ModalBuilder().setCustomId("flux_ticket_config:save_moderation").setTitle("Moderación de tickets");
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("max_open").setLabel("Máximo de tickets abiertos (1-10)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2).setValue(String(saved.maxOpenPerUser || 2))),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("autoclose_enabled").setLabel("Autocierre activado: si o no").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3).setValue(saved.autoCloseEnabled ? "si" : "no")),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("autoclose_hours").setLabel("Horas de inactividad (1-720)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3).setValue(String(saved.autoCloseHours || 24))),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("reminder_hours").setLabel("Recordatorio al staff (1-168 h)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3).setValue(String(saved.staffReminderHours || 4)))
  );
  return modal;
}

function categoryEditorModal(saved, categoryKey) {
  const defaults = config.ticket.categories[categoryKey] || {};
  const override = (saved.categoryOverrides || {})[categoryKey] || {};
  const modal = new ModalBuilder().setCustomId("flux_ticket_config:save_category:" + categoryKey).setTitle("Editar categoría: " + categoryKey.slice(0, 35));
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("category_label").setLabel("Nombre de la categoría en el panel").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setValue(String(override.label || defaults.label || categoryKey).slice(0, 100))),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("category_title").setLabel("Título del embed dentro del ticket").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(256).setValue(String(override.ticketTitle || defaults.ticketTitle || "{emoji} {name} • FLUX STORE").slice(0, 256))),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("category_description").setLabel("Descripción de esta categoría").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000).setValue(String(override.description || defaults.description || "Abre un ticket privado").slice(0, 1000))),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("category_emoji").setLabel("Emoji Unicode, nombre del servidor, ID o <:nombre:ID>").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setValue(String(override.emojiInput || "").slice(0, 100)))
  );
  return modal;
}

function effectiveCategories(guildId, guild = null) {
  const base = config.ticket.categories || {};
  const saved = guildConfig(guildId);
  const overrides = saved.categoryOverrides || {};
  return Object.entries(base).map(([key, item]) => {
    const override = overrides[key] || {};
    const merged = { ...item, ...override };
    if (!merged.emojiId && guild?.emojis?.cache) {
      const defaultEmoji = guild.emojis.cache.find(e => e.name === merged.emojiName || e.name === merged.emojiKey);
      if (defaultEmoji) {
        merged.emojiId = defaultEmoji.id;
        merged.emojiName = defaultEmoji.name;
      }
    }
    if (override.emojiInput) {
      const input = String(override.emojiInput).trim();
      const match = input.match(/^<a?:([a-zA-Z0-9_]+):(\d{17,20})>$/);
      merged.emojiUnicode = null;
      if (match) {
        merged.emojiName = match[1];
        merged.emojiId = match[2];
      } else if (/^\d{17,20}$/.test(input)) {
        const serverEmoji = guild?.emojis?.cache?.get(input);
        merged.emojiId = input;
        if (serverEmoji) merged.emojiName = serverEmoji.name;
      } else if (/\p{Extended_Pictographic}/u.test(input)) {
        merged.emojiId = null;
        merged.emojiUnicode = input;
        merged.emojiName = null;
      } else {
        const emojiName = input.replace(/^:/, "").replace(/:$/, "");
        const serverEmoji = guild?.emojis?.cache?.find(e => e.name === emojiName);
        merged.emojiId = serverEmoji?.id || null;
        merged.emojiName = serverEmoji?.name || emojiName;
        if (!serverEmoji) merged.emojiUnicode = null;
      }
    }
    return [key, merged];
  });
}

function advancedDetailComponents(key, guildId, guild = null) {
  if (key === "panel_editor") {
    const rows = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("flux_ticket_config:edit_panel")
          .setLabel("Editar título y apariencia")
          .setStyle(ButtonStyle.Primary)
      )
    ];
    const categories = effectiveCategories(guildId, guild).slice(0, 25);
    if (categories.length) {
      const categorySelect = new StringSelectMenuBuilder()
        .setCustomId("flux_ticket_config:category_edit_select")
        .setPlaceholder("Editar nombre, título, descripción o emoji de un ticket")
        .addOptions(categories.map(([value, item]) => ({
          label: String(item.label || value).slice(0, 100),
          value,
          description: String(item.description || "Editar este tipo de ticket").slice(0, 100),
          ...(item.emojiId ? { emoji: { id: String(item.emojiId), name: String(item.emojiName || item.emojiKey || "ticket").slice(0, 32) } }
            : item.emojiUnicode ? { emoji: { name: String(item.emojiUnicode).slice(0, 32) } } : {})
        })));
      rows.push(new ActionRowBuilder().addComponents(categorySelect));
    }
    const currentTemplate = String(guildConfig(guildId).channelNameTemplate || "ticket-{type}-{username}");
    const nameSelect = new StringSelectMenuBuilder()
      .setCustomId("flux_ticket_config:name_template")
      .setPlaceholder("Cambiar formato del nombre de los canales")
      .addOptions(
        { label: "ticket-{type}-{username}", value: "ticket-{type}-{username}", description: "Ej.: ticket-compras-usuario", default: currentTemplate === "ticket-{type}-{username}" },
        { label: "{type}-{username}", value: "{type}-{username}", description: "Ej.: compras-usuario", default: currentTemplate === "{type}-{username}" },
        { label: "ticket-{ticket}", value: "ticket-{ticket}", description: "Ej.: ticket-123456", default: currentTemplate === "ticket-{ticket}" }
      );
    rows.push(new ActionRowBuilder().addComponents(nameSelect));
    return rows;
  }
  if (key === "moderation") {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("flux_ticket_config:edit_moderation")
        .setLabel("Editar moderación")
        .setStyle(ButtonStyle.Primary)
    )];
  }
  if (key === "transcripts") {
    const select = new StringSelectMenuBuilder()
      .setCustomId("flux_ticket_config:transcript_mode")
      .setPlaceholder("Selecciona el modo de transcripción")
      .addOptions(
        { label: "Canal", value: "channel", description: "Enviar transcripciones al canal de logs" },
        { label: "DM", value: "dm", description: "Intentar enviar la transcripción por mensaje privado" },
        { label: "Canal + DM", value: "both", description: "Canal de logs y mensaje privado" }
      );
    return [new ActionRowBuilder().addComponents(select)];
  }
  if (key === "clients") {
    return [new ActionRowBuilder().addComponents(
      new RoleSelectMenuBuilder().setCustomId("flux_ticket_config:client_role").setPlaceholder("Selecciona el rol de cliente").setMinValues(1).setMaxValues(1)
    )];
  }
  if (key === "reviews") {
    return [new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId("flux_ticket_config:reviews_channel").setPlaceholder("Selecciona el canal de opiniones").setChannelTypes(ChannelType.GuildText).setMinValues(1).setMaxValues(1)
    )];
  }
  if (key === "names") {
    const select = new StringSelectMenuBuilder().setCustomId("flux_ticket_config:name_template")
      .setPlaceholder("Elige una plantilla de nombre")
      .addOptions(
        { label: "ticket-{type}-{username}", value: "ticket-{type}-{username}", description: "Ejemplo: ticket-compras-usuario" },
        { label: "{type}-{username}", value: "{type}-{username}", description: "Ejemplo: compras-usuario" },
        { label: "ticket-{ticket}", value: "ticket-{ticket}", description: "Ejemplo: ticket-123456" }
      );
    return [new ActionRowBuilder().addComponents(select)];
  }
  return [];
}

module.exports = function registerTicketConfigurator(client) {
  client.on("messageCreate", async message => {
    if (!message.guild || message.author.bot) return;
    const content = message.content.trim();
    const setupMatch = content.match(/^f!ticket\s+setup$/i);
    if (!setupMatch) return;
    const saved = guildConfig(message.guild.id);
    await message.channel.send({
      embeds: [mainEmbed(message.guild, saved)],
      components: mainComponents(),
      allowedMentions: { parse: [] }
    }).catch(error => console.error("No se pudo enviar el configurador de tickets:", error));
  });

  client.on("interactionCreate", async interaction => {
    if (!interaction.inGuild() || !interaction.customId?.startsWith("flux_ticket_config:")) return;
    if (!isAdmin(interaction.member)) {
      const response = { content: "❌ Solo administradores pueden cambiar la configuración de tickets.", ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.followUp(response).catch(() => {});
      else await interaction.reply(response).catch(() => {});
      return;
    }

    try {
      const action = interaction.customId.split(":")[1];
      const guild = interaction.guild;
      if (action === "panel_channel" || action === "ticket_category") {
        const id = interaction.values?.[0];
        updateGuild(guild.id, saved => {
          if (action === "panel_channel") saved.panelChannelId = id;
          else saved.ticketCategoryId = id;
        });
        const saved = guildConfig(guild.id);
        await interaction.update({ embeds: [mainEmbed(guild, saved)], components: mainComponents() });
        return;
      }
      if (action === "support_roles") {
        updateGuild(guild.id, saved => { saved.supportRoleIds = interaction.values || []; });
        await interaction.update({ embeds: [mainEmbed(guild, guildConfig(guild.id))], components: mainComponents() });
        return;
      }
      if (action === "advanced") {
        const advancedEmbed = new EmbedBuilder()
          .setColor(config.colors.primary || 0x8B5CF6)
          .setTitle("Ajustes avanzados")
          .setDescription([
            "Configura con precisión el comportamiento de los tickets de **FLUX STORE**.",
            "",
            "**APARIENCIA Y TICKETS** · título, descripción, color, nombres y emojis por tipo de solicitud.",
            "**NOMBRES DE CANAL** · formato aplicado cuando se crean tickets nuevos.",
            "**OPERACIÓN** · límite por miembro, recordatorios, transcripciones y autocierre.",
            "",
            "Elige un módulo en el menú. Los cambios se guardan en este servidor."
          ].join("\n"))
          .setFooter({ text: "FLUX STORE • Ajustes por servidor" })
          .setTimestamp();
        const guildIcon = guild.iconURL({ size: 128 });
        advancedEmbed.setAuthor(guildIcon
          ? { name: "FLUX STORE  /  CONFIGURACIÓN", iconURL: guildIcon }
          : { name: "FLUX STORE  /  CONFIGURACIÓN" });
        await interaction.reply({ embeds: [advancedEmbed], components: advancedComponents(), ephemeral: true });
        return;
      }
      if (action === "back") {
        await interaction.update({ embeds: [mainEmbed(guild, guildConfig(guild.id))], components: mainComponents() });
        return;
      }
      if (action === "category_edit_select") {
        const categoryKey = interaction.values?.[0];
        if (!categoryKey || !config.ticket.categories?.[categoryKey]) throw new Error("Categoría no válida.");
        await interaction.showModal(categoryEditorModal(guildConfig(guild.id), categoryKey));
        return;
      }
      if (action === "save_category") {
        const categoryKey = interaction.customId.split(":")[2];
        if (!categoryKey || !config.ticket.categories?.[categoryKey]) throw new Error("Categoría no válida.");
        const label = interaction.fields.getTextInputValue("category_label").trim();
        const ticketTitle = interaction.fields.getTextInputValue("category_title").trim();
        const description = interaction.fields.getTextInputValue("category_description").trim();
        const emojiInput = interaction.fields.getTextInputValue("category_emoji").trim();
        if (emojiInput) {
          const customMatch = emojiInput.match(/^<a?:([a-zA-Z0-9_]+):(\d{17,20})>$/);
          const customId = customMatch?.[2] || (/^\d{17,20}$/.test(emojiInput) ? emojiInput : null);
          const plainName = emojiInput.replace(/^:/, "").replace(/:$/, "");
          const emojiByName = guild.emojis.cache.find(item => item.name === plainName);
          const isUnicode = /\p{Extended_Pictographic}/u.test(emojiInput);
          if (customId && !guild.emojis.cache.has(customId)) {
            await interaction.reply({ content: "Ese emoji personalizado no está disponible en este servidor. Añádelo al servidor o usa un emoji Unicode.", ephemeral: true });
            return;
          }
          if (!customId && !isUnicode && !emojiByName) {
            await interaction.reply({ content: "No encontré un emoji con ese nombre en este servidor. Usa un emoji Unicode, un ID disponible o el formato <:nombre:ID>.", ephemeral: true });
            return;
          }
        }
        if (!label || !ticketTitle || !description) {
          await interaction.reply({ content: "El nombre y la descripción son obligatorios.", ephemeral: true });
          return;
        }
        updateGuild(guild.id, saved => {
          saved.categoryOverrides = saved.categoryOverrides || {};
          saved.categoryOverrides[categoryKey] = { label, ticketTitle, description, emojiInput };
        });
        await interaction.reply({ content: "✅ Categoría **" + label + "** guardada. El título se aplicará al embed del ticket y el nombre, descripción y emoji al panel. Publica de nuevo el panel para ver los cambios visuales.", ephemeral: true });
        return;
      }
      if (action === "edit_panel") {
        await interaction.showModal(panelEditorModal(guildConfig(guild.id)));
        return;
      }
      if (action === "edit_moderation") {
        await interaction.showModal(moderationModal(guildConfig(guild.id)));
        return;
      }
      if (action === "save_panel_editor") {
        const title = interaction.fields.getTextInputValue("panel_title").trim();
        const description = interaction.fields.getTextInputValue("panel_description").trim();
        const color = interaction.fields.getTextInputValue("panel_color").trim();
        const footer = interaction.fields.getTextInputValue("panel_footer").trim();
        const placeholder = interaction.fields.getTextInputValue("panel_placeholder").trim();
        if (!title || !description || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
          await interaction.reply({ content: "Título y descripción son obligatorios; el color debe tener formato #RRGGBB.", ephemeral: true });
          return;
        }
        updateGuild(guild.id, saved => {
          saved.panelTitle = title;
          saved.panelDescription = description;
          saved.panelColor = color.toUpperCase();
          saved.panelFooter = footer || "FLUX STORE • Soporte privado";
          saved.panelPlaceholder = placeholder || "Selecciona el motivo de tu solicitud";
        });
        await interaction.reply({ content: "✅ Apariencia guardada. En este mismo módulo puedes editar las categorías, sus emojis y el formato de los nombres de canal. Publica de nuevo el panel para actualizar el mensaje ya enviado.", ephemeral: true });
        return;
      }
      if (action === "save_moderation") {
        const maxOpen = Number(interaction.fields.getTextInputValue("max_open"));
        const autoCloseText = interaction.fields.getTextInputValue("autoclose_enabled").trim().toLowerCase();
        const autoCloseHours = Number(interaction.fields.getTextInputValue("autoclose_hours"));
        const reminderHours = Number(interaction.fields.getTextInputValue("reminder_hours"));
        if (!Number.isInteger(maxOpen) || maxOpen < 1 || maxOpen > 10 ||
            !["si", "sí", "no"].includes(autoCloseText) ||
            !Number.isInteger(autoCloseHours) || autoCloseHours < 1 || autoCloseHours > 720 ||
            !Number.isInteger(reminderHours) || reminderHours < 1 || reminderHours > 168) {
          await interaction.reply({ content: "❌ Revisa los límites: máximo 1-10 tickets, autocierre si/no, autocierre 1-720 horas y recordatorio 1-168 horas.", ephemeral: true });
          return;
        }
        updateGuild(guild.id, saved => {
          saved.maxOpenPerUser = maxOpen;
          saved.autoCloseEnabled = ["si", "sí"].includes(autoCloseText);
          saved.autoCloseHours = autoCloseHours;
          saved.staffReminderHours = reminderHours;
        });
        await interaction.reply({ content: "✅ Moderación guardada. El límite se aplica a nuevas aperturas; los recordatorios y el autocierre seguirán las horas configuradas.", ephemeral: true });
        return;
      }
      if (action === "advanced_select") {
        const key = interaction.values?.[0];
        const saved = guildConfig(guild.id);
        const embed = new EmbedBuilder().setColor(config.colors.primary || 0x8B5CF6)
          .setTitle("⚙️ " + (ADVANCED_OPTIONS.find(x => x.value === key)?.label || "Configuración"))
          .setDescription(advancedDescription(key, saved, guild));
        await interaction.update({ embeds: [embed], components: [...advancedDetailComponents(key, guild.id, guild), ...advancedComponents()] });
        return;
      }
      if (action === "transcript_mode") {
        const mode = interaction.values?.[0];
        if (!["channel", "dm", "both"].includes(mode)) throw new Error("Modo de transcripción no válido.");
        updateGuild(guild.id, saved => { saved.transcriptMode = mode; });
        await interaction.update({
          embeds: [new EmbedBuilder().setColor(config.colors.success || 0x22C55E).setTitle("✅ Transcripciones actualizadas").setDescription("Modo guardado: **" + mode + "**.")],
          components: advancedComponents()
        });
        return;
      }
      if (action === "client_role") {
        const roleId = interaction.values?.[0];
        updateGuild(guild.id, saved => { saved.clientRoleId = roleId; });
        await interaction.update({ embeds: [new EmbedBuilder().setColor(config.colors.success || 0x22C55E).setTitle("✅ Rol de cliente guardado").setDescription("Rol configurado: <@&" + roleId + ">.")], components: advancedComponents() });
        return;
      }
      if (action === "reviews_channel") {
        const channelId = interaction.values?.[0];
        updateGuild(guild.id, saved => { saved.reviewsChannelId = channelId; });
        await interaction.update({ embeds: [new EmbedBuilder().setColor(config.colors.success || 0x22C55E).setTitle("✅ Canal de opiniones guardado").setDescription("Canal configurado: <#" + channelId + ">.")], components: advancedComponents() });
        return;
      }
      if (action === "name_template") {
        const template = interaction.values?.[0];
        const allowed = ["ticket-{type}-{username}", "{type}-{username}", "ticket-{ticket}"];
        if (!allowed.includes(template)) throw new Error("Plantilla no válida.");
        updateGuild(guild.id, saved => { saved.channelNameTemplate = template; });
        await interaction.update({ embeds: [new EmbedBuilder().setColor(config.colors.success || 0x22C55E).setTitle("✅ Plantilla de nombres guardada").setDescription("Plantilla: `" + template + "`")], components: advancedComponents() });
        return;
      }
      if (action === "create_panel") {
        const saved = guildConfig(guild.id);
        const channel = saved.panelChannelId ? guild.channels.cache.get(saved.panelChannelId) : null;
        if (!channel?.isTextBased() || !channel.send) {
          await interaction.reply({ content: "Selecciona primero un canal de texto para el panel.", ephemeral: true });
          return;
        }
        if (!saved.ticketCategoryId || !guild.channels.cache.has(saved.ticketCategoryId)) {
          await interaction.reply({ content: "Selecciona primero una categoría de tickets.", ephemeral: true });
          return;
        }
        if (!saved.supportRoleIds?.length) {
          await interaction.reply({ content: "Selecciona al menos un rol de soporte.", ephemeral: true });
          return;
        }
        const categories = effectiveCategories(guild.id, guild);
        const categoryOptions = categories.slice(0, 25).map(([value, item]) => {
          const option = {
            label: String(item.label || value).slice(0, 100),
            value,
            description: String(item.description || "Abre una solicitud privada").slice(0, 100)
          };
          if (item.emojiId && /^\d{17,20}$/.test(String(item.emojiId))) {
            option.emoji = {
              id: String(item.emojiId),
              name: String(item.emojiName || item.emojiKey || "ticket").slice(0, 32)
            };
          } else if (item.emojiUnicode) {
            option.emoji = { name: String(item.emojiUnicode).slice(0, 32) };
          }
          return option;
        });
        const menu = new StringSelectMenuBuilder().setCustomId("ticket_create")
          .setPlaceholder(String(saved.panelPlaceholder || "Selecciona el motivo de tu solicitud").slice(0, 100))
          .setMinValues(1).setMaxValues(1)
          .addOptions(categoryOptions);

        const panelDescription = [
          String(saved.panelDescription || "Te damos la bienvenida al centro oficial de atención de FLUX STORE. Selecciona una categoría para iniciar una solicitud privada.").trim().slice(0, 1400),
          "",
          "**CÓMO FUNCIONA**",
          "01 · Selecciona el tipo de solicitud en el menú inferior.",
          "02 · Se creará un canal privado para atender tu caso.",
          "03 · El equipo de FLUX STORE continuará la atención dentro del ticket.",
          "",
          "**PRIVACIDAD Y SEGURIDAD**",
          "No compartas contraseñas, tokens ni información sensible."
        ].join("\n");
        const panel = new EmbedBuilder()
          .setColor(/^#[0-9A-Fa-f]{6}$/.test(saved.panelColor || "") ? parseInt(saved.panelColor.slice(1), 16) : (config.colors.primary || 0x8B5CF6))
          .setTitle(String(saved.panelTitle || "FLUX STORE • Centro de atención").slice(0, 256))
          .setDescription(panelDescription.slice(0, 4096))
          .setFooter({ text: String(saved.panelFooter || "FLUX STORE • Soporte privado").slice(0, 2048) })
          .setTimestamp();
        const panelIcon = guild.iconURL({ size: 128 });
        panel.setAuthor(panelIcon
          ? { name: "FLUX STORE  /  CENTRO DE SOPORTE", iconURL: panelIcon }
          : { name: "FLUX STORE  /  CENTRO DE SOPORTE" });
        const sent = await channel.send({ embeds: [panel], components: [new ActionRowBuilder().addComponents(menu)] });
        await interaction.reply({ content: "✅ Panel enviado a " + channel.toString() + ". Mensaje: " + sent.url, ephemeral: true });
        return;
      }
    } catch (error) {
      console.error("Error en el configurador de tickets:", error);
      const response = { content: "❌ No se pudo actualizar la configuración. Revisa los permisos y vuelve a intentarlo.", ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.followUp(response).catch(() => {});
      else await interaction.reply(response).catch(() => {});
    }
  });
};
