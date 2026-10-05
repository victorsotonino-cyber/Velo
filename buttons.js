const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType, PermissionFlagsBits } = require("discord.js");
const config = require("./config");

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
        if (old) return i.reply({ content: "❌ Ya tienes un ticket: " + old, ephemeral: true });

        const staffRole = i.guild.roles.cache.get(config.roles.staff);
        if (!staffRole) {
          return i.reply({ content: "❌ El rol de staff configurado no existe. Revisa `config.js`.", ephemeral: true });
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
          .setTitle("🎫 Ticket de Velo Studio")
          .setDescription("Hola " + i.user + ", explica tu problema aquí.\n\n**Tipo:** " + i.values[0]);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("ticket_close").setLabel("Cerrar").setEmoji("🔒").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("ticket_lock").setLabel("Bloquear usuario").setEmoji("🚫").setStyle(ButtonStyle.Secondary)
        );

        await ch.send({ content: i.user + " <@&" + staffRole.id + ">", embeds: [embed], components: [row] });
        return i.reply({ content: "✅ Ticket creado: " + ch, ephemeral: true });
      }

      if (i.isButton() && i.customId === "ticket_close") {
        if (!i.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
          return i.reply({ content: "❌ Sin permisos.", ephemeral: true });
        }
        await i.reply("🔒 Ticket cerrado. Se eliminará en 5 segundos.");
        setTimeout(() => i.channel.delete("Ticket cerrado").catch(() => {}), 5000);
        return;
      }

      if (i.isButton() && i.customId === "ticket_lock") {
        if (!i.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
          return i.reply({ content: "❌ Sin permisos.", ephemeral: true });
        }

        const creatorId = i.channel.topic?.startsWith("VeloTicket:")
          ? i.channel.topic.slice("VeloTicket:".length)
          : null;

        if (creatorId) {
          await i.channel.permissionOverwrites.edit(creatorId, { SendMessages: false });
        }
        await i.reply("🚫 Usuario del ticket bloqueado.");
        return;
      }

      if (i.isStringSelectMenu() && i.customId === "help_category") {
        const text = {
          utilidad: "🧰 /ping /avatar /serverinfo",
          moderacion: "🛡️ /ban /kick /timeout /clear",
          tickets: "🎫 /ticket-panel /ticket-config /ticket-edit",
          servidor: "🏠 /serverinfo",
          diversion: "🎮 Próximamente.",
          configuracion: "⚙️ /ticket-config /ticket-edit"
        }[i.values[0]] || "Sin información.";
        return i.reply({ content: text, ephemeral: true });
      }
    } catch (e) {
      console.error("Error en interacción:", e);
      if (!i.replied && !i.deferred) {
        await i.reply({ content: "❌ No pude completar esa acción. Revisa los permisos del bot.", ephemeral: true }).catch(() => {});
      }
    }
  });
};