const {
  Events,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const config = require("../config");

module.exports = client => {
  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    if (interaction.isStringSelectMenu() && interaction.customId === "ticket_create") {
      const type = interaction.values[0];
      const base = `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 80);

      const existing = interaction.guild.channels.cache.find(
        c => c.name === base
      );

      if (existing) {
        return interaction.reply({ content: `❌ Ya tienes un ticket: ${existing}`, ephemeral: true });
      }

      const channel = await interaction.guild.channels.create({
        name: base,
        type: ChannelType.GuildText,
        parent: config.channels.tickets,
        permissionOverwrites: [
          { id: interaction.guild.roles.everyone.id, deny: ["ViewChannel"] },
          { id: interaction.user.id, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] },
          { id: config.roles.staff, allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"] }
        ]
      });

      const embed = new EmbedBuilder()
        .setColor(config.colors.primary)
        .setTitle("🎫 Velo Studio — Ticket")
        .setDescription(`Ticket de **${type}** creado para ${interaction.user}.\n\nExplica aquí lo que necesitas.`);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket_close").setLabel("Cerrar").setEmoji("🔒").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("ticket_lock").setLabel("Bloquear").setEmoji("🔐").setStyle(ButtonStyle.Secondary)
      );

      await channel.send({
        content: `${interaction.user} <@&${config.roles.staff}>`,
        embeds: [embed],
        components: [row]
      });

      return interaction.reply({ content: `✅ Ticket creado: ${channel}`, ephemeral: true });
    }

    if (!interaction.isButton()) return;

    if (interaction.customId === "ticket_close") {
      await interaction.reply("🔒 Cerrando ticket en 5 segundos...");
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }

    if (interaction.customId === "ticket_lock") {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
        ViewChannel: false
      });
      await interaction.reply("🔐 Ticket bloqueado.");
    }
  });
};
