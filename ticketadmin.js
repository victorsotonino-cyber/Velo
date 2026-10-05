const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType
} = require("discord.js");

const isStaff = i => i.member.permissions.has(PermissionFlagsBits.ManageChannels);

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket-edit")
    .setDescription("Administra completamente el sistema de tickets.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand(s => s
      .setName("crear-categoria")
      .setDescription("Crea una nueva categoría para tickets.")
      .addStringOption(o => o.setName("nombre").setDescription("Nombre de la categoría").setRequired(true)))
    .addSubcommand(s => s
      .setName("eliminar-categoria")
      .setDescription("Elimina una categoría de tickets.")
      .addChannelOption(o => o.setName("categoria").setDescription("Categoría").addChannelTypes(ChannelType.GuildCategory).setRequired(true)))
    .addSubcommand(s => s
      .setName("renombrar-categoria")
      .setDescription("Cambia el nombre de una categoría.")
      .addChannelOption(o => o.setName("categoria").setDescription("Categoría").addChannelTypes(ChannelType.GuildCategory).setRequired(true))
      .addStringOption(o => o.setName("nombre").setDescription("Nuevo nombre").setRequired(true)))
    .addSubcommand(s => s
      .setName("mover")
      .setDescription("Mueve el ticket a otra categoría.")
      .addChannelOption(o => o.setName("categoria").setDescription("Nueva categoría").addChannelTypes(ChannelType.GuildCategory).setRequired(true)))
    .addSubcommand(s => s
      .setName("quitar-categoria")
      .setDescription("Quita el ticket de su categoría.")
      .addChannelOption(o => o.setName("ticket").setDescription("Ticket").addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand(s => s
      .setName("renombrar")
      .setDescription("Cambia el nombre de un ticket.")
      .addStringOption(o => o.setName("nombre").setDescription("Nuevo nombre").setRequired(true))
      .addChannelOption(o => o.setName("ticket").setDescription("Ticket").addChannelTypes(ChannelType.GuildText).setRequired(false)))
    .addSubcommand(s => s
      .setName("añadir")
      .setDescription("Añade un usuario al ticket.")
      .addUserOption(o => o.setName("usuario").setDescription("Usuario").setRequired(true))
      .addChannelOption(o => o.setName("ticket").setDescription("Ticket").addChannelTypes(ChannelType.GuildText).setRequired(false)))
    .addSubcommand(s => s
      .setName("quitar")
      .setDescription("Quita un usuario del ticket.")
      .addUserOption(o => o.setName("usuario").setDescription("Usuario").setRequired(true))
      .addChannelOption(o => o.setName("ticket").setDescription("Ticket").addChannelTypes(ChannelType.GuildText).setRequired(false)))
    .addSubcommand(s => s
      .setName("bloquear")
      .setDescription("Impide que un usuario escriba en el ticket.")
      .addUserOption(o => o.setName("usuario").setDescription("Usuario").setRequired(true))
      .addChannelOption(o => o.setName("ticket").setDescription("Ticket").addChannelTypes(ChannelType.GuildText).setRequired(false)))
    .addSubcommand(s => s
      .setName("desbloquear")
      .setDescription("Permite escribir de nuevo a un usuario.")
      .addUserOption(o => o.setName("usuario").setDescription("Usuario").setRequired(true))
      .addChannelOption(o => o.setName("ticket").setDescription("Ticket").addChannelTypes(ChannelType.GuildText).setRequired(false)))
    .addSubcommand(s => s
      .setName("ver")
      .setDescription("Muestra la configuración del ticket actual.")
      .addChannelOption(o => o.setName("ticket").setDescription("Ticket").addChannelTypes(ChannelType.GuildText).setRequired(false)))
    .addSubcommand(s => s
      .setName("slowmode")
      .setDescription("Configura el slowmode del ticket.")
      .addIntegerOption(o => o.setName("segundos").setDescription("0-21600").setMinValue(0).setMaxValue(21600).setRequired(true))
      .addChannelOption(o => o.setName("ticket").setDescription("Ticket").addChannelTypes(ChannelType.GuildText).setRequired(false)))
    .addSubcommand(s => s
      .setName("privado")
      .setDescription("Hace el ticket privado para su creador y staff.")
      .addChannelOption(o => o.setName("ticket").setDescription("Ticket").addChannelTypes(ChannelType.GuildText).setRequired(false))),

  async execute(interaction) {
    if (!isStaff(interaction)) {
      return interaction.reply({ content: "❌ Necesitas **Gestionar canales**.", ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "crear-categoria") {
      const name = interaction.options.getString("nombre");
      const category = await interaction.guild.channels.create({
        name,
        type: ChannelType.GuildCategory
      });
      return interaction.reply(`✅ Categoría creada: **${category.name}**\nID: \`${category.id}\``);
    }

    if (sub === "eliminar-categoria") {
      const category = interaction.options.getChannel("categoria");
      await category.delete("Categoría de tickets eliminada por Staff");
      return interaction.reply(`🗑️ Categoría **${category.name}** eliminada.`);
    }

    if (sub === "renombrar-categoria") {
      const category = interaction.options.getChannel("categoria");
      const name = interaction.options.getString("nombre");
      await category.setName(name);
      return interaction.reply(`✏️ Categoría renombrada a **${name}**.`);
    }

    const ticket = interaction.options.getChannel("ticket") || interaction.channel;

    if (!ticket || ticket.type !== ChannelType.GuildText) {
      return interaction.reply({ content: "❌ Selecciona un canal de texto válido.", ephemeral: true });
    }

    if (sub === "mover") {
      const category = interaction.options.getChannel("categoria");
      await ticket.setParent(category.id, { lockPermissions: false });
      return interaction.reply(`📁 Ticket movido a **${category.name}**.`);
    }

    if (sub === "quitar-categoria") {
      await ticket.setParent(null, { lockPermissions: false });
      return interaction.reply("📂 Categoría quitada del ticket.");
    }

    if (sub === "renombrar") {
      const name = interaction.options.getString("nombre")
        .toLowerCase().replace(/[^a-z0-9-_]/g, "-").slice(0, 90);
      await ticket.setName(name);
      return interaction.reply(`✏️ Ticket renombrado a **${name}**.`);
    }

    if (sub === "añadir") {
      const user = interaction.options.getUser("usuario");
      await ticket.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      });
      return interaction.reply(`➕ ${user} fue añadido al ticket.`);
    }

    if (sub === "quitar") {
      const user = interaction.options.getUser("usuario");
      await ticket.permissionOverwrites.delete(user.id).catch(() => {});
      return interaction.reply(`➖ ${user} fue quitado del ticket.`);
    }

    if (sub === "bloquear") {
      const user = interaction.options.getUser("usuario");
      await ticket.permissionOverwrites.edit(user.id, { SendMessages: false });
      return interaction.reply(`🔒 ${user} ya no puede escribir.`);
    }

    if (sub === "desbloquear") {
      const user = interaction.options.getUser("usuario");
      await ticket.permissionOverwrites.edit(user.id, { SendMessages: true });
      return interaction.reply(`🔓 ${user} puede escribir nuevamente.`);
    }

    if (sub === "slowmode") {
      const seconds = interaction.options.getInteger("segundos");
      await ticket.setRateLimitPerUser(seconds);
      return interaction.reply(`⏱️ Slowmode establecido en **${seconds}s**.`);
    }

    if (sub === "privado") {
      await ticket.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
        ViewChannel: false
      });
      return interaction.reply("🔐 El ticket ahora es privado.");
    }

    if (sub === "ver") {
      const overwrites = ticket.permissionOverwrites.cache.size;
      return interaction.reply({
        content:
          `🎫 **Ticket:** ${ticket}\n` +
          `📛 Nombre: **${ticket.name}**\n` +
          `📁 Categoría: **${ticket.parent?.name || "Ninguna"}**\n` +
          `🆔 ID: \`${ticket.id}\`\n` +
          `⏱️ Slowmode: **${ticket.rateLimitPerUser}s**\n` +
          `🔐 Permisos configurados: **${overwrites}**`,
        ephemeral: true
      });
    }
  }
};
