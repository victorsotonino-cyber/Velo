const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const config = require("./config");

const ticketOpt = o => o.setName("ticket").setDescription("Canal del ticket").setRequired(false).addChannelTypes(ChannelType.GuildText);
const categoryOpt = o => o.setName("categoria").setDescription("Categoría").setRequired(true).addChannelTypes(ChannelType.GuildCategory);

function cleanName(value, fallback) {
  const name = value.toLowerCase().trim().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 90);
  return name || fallback;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("ticket-edit")
    .setDescription("Administra categorías y tickets.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .addSubcommand(s => s.setName("crear-categoria").setDescription("Crea una categoría.").addStringOption(o => o.setName("nombre").setDescription("Nombre").setRequired(true).setMaxLength(100)))
    .addSubcommand(s => s.setName("eliminar-categoria").setDescription("Elimina una categoría.").addChannelOption(categoryOpt))
    .addSubcommand(s => s.setName("renombrar-categoria").setDescription("Renombra una categoría.").addChannelOption(categoryOpt).addStringOption(o => o.setName("nombre").setDescription("Nuevo nombre").setRequired(true).setMaxLength(100)))
    .addSubcommand(s => s.setName("mover").setDescription("Mueve un ticket.").addChannelOption(categoryOpt).addChannelOption(ticketOpt))
    .addSubcommand(s => s.setName("quitar-categoria").setDescription("Quita la categoría.").addChannelOption(ticketOpt))
    .addSubcommand(s => s.setName("renombrar").setDescription("Renombra un ticket.").addStringOption(o => o.setName("nombre").setDescription("Nuevo nombre").setRequired(true).setMaxLength(90)).addChannelOption(ticketOpt))
    .addSubcommand(s => s.setName("anadir").setDescription("Añade un usuario.").addUserOption(o => o.setName("usuario").setDescription("Usuario").setRequired(true)).addChannelOption(ticketOpt))
    .addSubcommand(s => s.setName("quitar").setDescription("Quita un usuario.").addUserOption(o => o.setName("usuario").setDescription("Usuario").setRequired(true)).addChannelOption(ticketOpt))
    .addSubcommand(s => s.setName("bloquear").setDescription("Bloquea a un usuario.").addUserOption(o => o.setName("usuario").setDescription("Usuario").setRequired(true)).addChannelOption(ticketOpt))
    .addSubcommand(s => s.setName("desbloquear").setDescription("Desbloquea a un usuario.").addUserOption(o => o.setName("usuario").setDescription("Usuario").setRequired(true)).addChannelOption(ticketOpt))
    .addSubcommand(s => s.setName("slowmode").setDescription("Configura slowmode.").addIntegerOption(o => o.setName("segundos").setDescription("0-21600").setMinValue(0).setMaxValue(21600).setRequired(true)).addChannelOption(ticketOpt))
    .addSubcommand(s => s.setName("privado").setDescription("Hace privado el ticket.").addChannelOption(ticketOpt))
    .addSubcommand(s => s.setName("ver").setDescription("Ve la configuración del ticket.").addChannelOption(ticketOpt)),
  async execute(i) {
    const sub = i.options.getSubcommand();
    const ticket = i.options.getChannel("ticket") || i.channel;

    if (sub === "crear-categoria") {
      const c = await i.guild.channels.create({ name: i.options.getString("nombre").trim(), type: ChannelType.GuildCategory });
      return i.reply("✅ Categoría creada: " + c);
    }

    if (sub === "eliminar-categoria") {
      const c = i.options.getChannel("categoria");
      if (!c) return i.reply({ content: "❌ Debes indicar una categoría.", ephemeral: true });
      if (c.id === config.channels.tickets) return i.reply({ content: "❌ No puedes eliminar la categoría base de tickets desde este comando.", ephemeral: true });
      await c.delete("Categoría eliminada por ticket-edit");
      return i.reply("🗑️ Categoría eliminada.");
    }

    if (sub === "renombrar-categoria") {
      const c = i.options.getChannel("categoria");
      await c.setName(i.options.getString("nombre").trim());
      return i.reply("✏️ Categoría renombrada.");
    }

    if (sub === "mover") {
      const c = i.options.getChannel("categoria");
      await ticket.setParent(c.id, { lockPermissions: false });
      return i.reply("📂 " + ticket + " movido a **" + c.name + "**.");
    }

    if (sub === "quitar-categoria") {
      await ticket.setParent(null, { lockPermissions: false });
      return i.reply("📂 Categoría quitada.");
    }

    if (sub === "renombrar") {
      const n = cleanName(i.options.getString("nombre"), "ticket-" + i.user.id);
      await ticket.setName(n);
      return i.reply("✏️ Ticket renombrado a **" + n + "**.");
    }

    if (["anadir", "quitar", "bloquear", "desbloquear"].includes(sub)) {
      const u = i.options.getUser("usuario");

      if (sub === "quitar") {
        await ticket.permissionOverwrites.delete(u.id).catch(() => {});
        return i.reply("✅ " + u + " quitado del ticket.");
      }

      if (sub === "bloquear") {
        await ticket.permissionOverwrites.edit(u.id, { ViewChannel: true, SendMessages: false, ReadMessageHistory: true });
        return i.reply("🚫 " + u + " bloqueado.");
      }

      await ticket.permissionOverwrites.edit(u.id, {
        ViewChannel: true,
        SendMessages: sub === "desbloquear",
        ReadMessageHistory: true
      });
      return i.reply("✅ " + u + (sub === "desbloquear" ? " desbloqueado." : " añadido al ticket."));
    }

    if (sub === "slowmode") {
      const s = i.options.getInteger("segundos");
      await ticket.setRateLimitPerUser(s);
      return i.reply("🐌 Slowmode: **" + s + "s**.");
    }

    if (sub === "privado") {
      await ticket.permissionOverwrites.edit(i.guild.roles.everyone.id, { ViewChannel: false });
      return i.reply("🔒 Ticket privado.");
    }

    if (sub === "ver") {
      const ow = ticket.permissionOverwrites.cache.get(i.guild.roles.everyone.id);
      return i.reply({
        ephemeral: true,
        content: "🎫 **Ticket:** " + ticket.name +
          "\n📂 **Categoría:** " + (ticket.parent?.name || "Ninguna") +
          "\n🐌 **Slowmode:** " + ticket.rateLimitPerUser + "s" +
          "\n🔒 **Privado:** " + (ow?.deny.has(PermissionFlagsBits.ViewChannel) ? "Sí" : "No")
      });
    }
  }
};