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
  { label: "🎨 Editor visual del panel", value: "panel_editor", description: "Editar título, descripción, color y pie" },
  { label: "🛡️ Moderación de tickets", value: "moderation", description: "Límites, recordatorios y autocierre" }
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
  return new EmbedBuilder()
    .setColor(config.colors.primary || 0x8B5CF6)
    .setTitle("✦ FLUX STORE • Configuración de tickets")
    .setDescription("Configura el canal donde irá el panel, el equipo de soporte y la categoría donde se crearán los tickets. Los cambios se guardan automáticamente.")
    .addFields(
      { name: "📨 Canal del panel", value: channel ? channel.toString() : "No seleccionado", inline: true },
      { name: "🛡️ Roles de soporte", value: roles.length ? roles.map(r => r.toString()).join(", ") : "No seleccionados", inline: true },
      { name: "🗂️ Categoría de tickets", value: category ? category.toString() : "No seleccionada", inline: true },
      { name: "📑 Transcripciones", value: saved.transcriptMode || "channel", inline: true },
      { name: "👥 Rol de cliente", value: saved.clientRoleId ? "<@&" + saved.clientRoleId + ">" : "No seleccionado", inline: true },
      { name: "🔢 Máximo por usuario", value: String(saved.maxOpenPerUser || 2), inline: true }
    )
    .setFooter({ text: guild.name + " • Configuración guardada automáticamente" });
}

function mainComponents() {
  const channelMenu = new ChannelSelectMenuBuilder()
    .setCustomId("flux_ticket_config:panel_channel")
    .setPlaceholder("Elige el canal del panel")
    .setChannelTypes(ChannelType.GuildText)
    .setMinValues(1).setMaxValues(1);
  const roleMenu = new RoleSelectMenuBuilder()
    .setCustomId("flux_ticket_config:support_roles")
    .setPlaceholder("Elige el rol de soporte")
    .setMinValues(1).setMaxValues(5);
  const categoryMenu = new ChannelSelectMenuBuilder()
    .setCustomId("flux_ticket_config:ticket_category")
    .setPlaceholder("Elige una categoría para los tickets")
    .setChannelTypes(ChannelType.GuildCategory)
    .setMinValues(1).setMaxValues(1);
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("flux_ticket_config:create_panel").setLabel("Crear panel").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("flux_ticket_config:advanced").setLabel("Avanzado").setStyle(ButtonStyle.Primary)
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
    .setPlaceholder("Selecciona una opción avanzada")
    .addOptions(ADVANCED_OPTIONS);
  const back = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("flux_ticket_config:back").setLabel("Volver").setStyle(ButtonStyle.Secondary)
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
    panel_editor: "Título: **" + (saved.panelTitle || "✦ FLUX STORE • Centro de atención") + "**\nColor: **" + (saved.panelColor || "#8B5CF6") + "**\nDescripción: " + (saved.panelDescription || "Selecciona el tipo de solicitud para abrir un ticket privado.").slice(0, 500),
    moderation: "Máximo de tickets abiertos por usuario: **" + (saved.maxOpenPerUser || 2) + "**\nAutocierre: **" + (saved.autoCloseEnabled ? "activado" : "desactivado") + "**\nHoras de inactividad: **" + (saved.autoCloseHours || 24) + "**\nRecordatorio al staff: **" + (saved.staffReminderHours || 4) + " h**"
  };
  return details[key] || "Opción de configuración no reconocida.";
}

function panelEditorModal(saved) {
  const modal = new ModalBuilder().setCustomId("flux_ticket_config:save_panel_editor").setTitle("Editar panel de tickets");
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("panel_title").setLabel("Título del panel").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(256).setValue(String(saved.panelTitle || "✦ FLUX STORE • Centro de atención").slice(0, 256))),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("panel_description").setLabel("Descripción del panel").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(4000).setValue(String(saved.panelDescription || "Selecciona el tipo de solicitud para abrir un ticket privado.").slice(0, 4000))),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("panel_color").setLabel("Color hexadecimal (ej. #8B5CF6)").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(7).setValue(String(saved.panelColor || "#8B5CF6"))),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("panel_footer").setLabel("Texto del pie").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setValue(String(saved.panelFooter || "FLUX STORE • Soporte privado").slice(0, 100)))
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

function advancedDetailComponents(key) {
  if (key === "panel_editor" || key === "moderation") {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(key === "panel_editor" ? "flux_ticket_config:edit_panel" : "flux_ticket_config:edit_moderation")
        .setLabel(key === "panel_editor" ? "Editar apariencia" : "Editar moderación")
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
    const setupMatch = content.match(/^m!(?:ticket\\s+setup|mticket\\s+setup)$/i);
    const blacklistMatch = content.match(/^m!ticket\\s+(blacklist|unblacklist|blacklist-list)(?:\\s+(.+))?$/i);
    if (!setupMatch && !blacklistMatch) return;
    if (!isAdmin(message.member)) {
      await message.reply("❌ Solo administradores o el rol de administrador configurado pueden usar este panel.").catch(() => {});
      return;
    }
    if (blacklistMatch) {
      const action = blacklistMatch[1].toLowerCase();
      const argText = (blacklistMatch[2] || "").trim();
      const store = readStore();
      const saved = store[message.guild.id] || {};
      const list = Array.isArray(saved.ticketBlacklist) ? saved.ticketBlacklist : [];
      if (action === "blacklist-list") {
        const description = list.slice(0, 25).map(entry =>
          "• <@" + entry.userId + "> — " + String(entry.reason || "Sin razón indicada").slice(0, 120)
        ).join("\\n");
        return message.reply({
          embeds: [new EmbedBuilder().setColor(config.colors.primary || 0x8B5CF6)
            .setTitle("🚫 Lista negra de tickets")
            .setDescription(description || "No hay usuarios bloqueados.")],
          allowedMentions: { parse: [] }
        });
      }
      const target = message.mentions.users.first() || (argText.match(/\\b\\d{17,20}\\b/) ? await message.client.users.fetch(argText.match(/\\b\\d{17,20}\\b/)[0]).catch(() => null) : null);
      if (!target) return message.reply("Uso: `m!ticket " + action + " @usuario [razón]`").catch(() => {});
      if (action === "blacklist") {
        const reason = argText.replace(/<@!?\\d+>/, "").trim().slice(0, 300) || "Sin razón indicada";
        const existing = list.find(entry => entry.userId === target.id);
        if (existing) return message.reply("Ese usuario ya está en la lista negra de tickets.").catch(() => {});
        list.push({ userId: target.id, reason, by: message.author.id, at: new Date().toISOString() });
        saved.ticketBlacklist = list.slice(-1000);
        store[message.guild.id] = saved;
        writeStore(store);
        return message.reply("🚫 " + target.tag + " ya no puede abrir tickets en este servidor. Razón: " + reason).catch(() => {});
      }
      const next = list.filter(entry => entry.userId !== target.id);
      if (next.length === list.length) return message.reply("Ese usuario no estaba bloqueado.").catch(() => {});
      saved.ticketBlacklist = next;
      store[message.guild.id] = saved;
      writeStore(store);
      return message.reply("✅ Se quitó a " + target.tag + " de la lista negra de tickets.").catch(() => {});
    }
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
        await interaction.reply({ embeds: [new EmbedBuilder().setColor(config.colors.primary || 0x8B5CF6).setTitle("⚙️ Configuración avanzada • FLUX STORE").setDescription("Selecciona una sección para revisar su configuración.")], components: advancedComponents(), ephemeral: true });
        return;
      }
      if (action === "back") {
        await interaction.update({ embeds: [mainEmbed(guild, guildConfig(guild.id))], components: mainComponents() });
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
        if (!title || !description || !/^#[0-9A-Fa-f]{6}$/.test(color)) {
          await interaction.reply({ content: "Título y descripción son obligatorios; el color debe tener formato #RRGGBB.", ephemeral: true });
          return;
        }
        updateGuild(guild.id, saved => {
          saved.panelTitle = title;
          saved.panelDescription = description;
          saved.panelColor = color.toUpperCase();
          saved.panelFooter = footer || "FLUX STORE • Soporte privado";
        });
        await interaction.reply({ content: "✅ Apariencia guardada. Los próximos paneles usarán estos valores; vuelve a publicar el panel para actualizar uno ya enviado.", ephemeral: true });
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
        await interaction.reply({ content: "✅ Moderación guardada. El límite se aplica a nuevas aperturas. Las automatizaciones de recordatorio/autocierre requieren soporte en el módulo de automatización.", ephemeral: true });
        return;
      }
      if (action === "advanced_select") {
        const key = interaction.values?.[0];
        const saved = guildConfig(guild.id);
        const embed = new EmbedBuilder().setColor(config.colors.primary || 0x8B5CF6)
          .setTitle("⚙️ " + (ADVANCED_OPTIONS.find(x => x.value === key)?.label || "Configuración"))
          .setDescription(advancedDescription(key, saved, guild));
        await interaction.update({ embeds: [embed], components: [...advancedDetailComponents(key), ...advancedComponents().slice(1)] });
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
        const categories = Object.entries(config.ticket.categories || {});
        const menu = new StringSelectMenuBuilder().setCustomId("ticket_create")
          .setPlaceholder("Selecciona una categoría de atención")
          .setMinValues(1).setMaxValues(1)
          .addOptions(categories.slice(0, 25).map(([value, item]) => ({
            label: String(item.label || value).slice(0, 100),
            value,
            description: String(item.description || "Abre un ticket privado").slice(0, 100)
          })));
        const panel = new EmbedBuilder().setColor(/^#[0-9A-Fa-f]{6}$/.test(saved.panelColor || "") ? parseInt(saved.panelColor.slice(1), 16) : (config.colors.primary || 0x8B5CF6))
          .setTitle(String(saved.panelTitle || "✦ FLUX STORE • Centro de atención").slice(0, 256))
          .setDescription(String(saved.panelDescription || "Selecciona el tipo de solicitud para abrir un ticket privado.").slice(0, 2500) + "\n\n" +
            categories.map(([key, item]) => "🎫 **" + item.label + "**\n" + item.description).join("\n\n") +
            "\n\nNo compartas contraseñas ni datos sensibles.")
          .setFooter({ text: String(saved.panelFooter || "FLUX STORE • Soporte privado").slice(0, 2048) })
          .setTimestamp();
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
