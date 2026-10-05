const {
  ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, EmbedBuilder
} = require('discord.js');
const db = require('../utils/ticketsDb');
const embeds = require('../utils/embeds');
const config = require('../config');

function fillTemplate(str, vars) {
  return str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

async function openTicket(interaction) {
  const catId = interaction.values[0];
  const cfg = db.get();
  const cat = cfg.categories.find(c => c.id === catId);
  if (!cat) return interaction.reply({ embeds: [embeds.error('Categoría no encontrada.')], ephemeral: true });

  const guild = interaction.guild;

  // Límite de tickets por usuario
  const max = cfg.advanced.maxPerUser;
  const existing = guild.channels.cache.filter(c =>
    c.topic?.includes(`owner:${interaction.user.id}`) && !c.name.startsWith('cerrado-')
  );
  if (existing.size >= max) {
    return interaction.reply({
      embeds: [embeds.warn(`Ya tienes ${existing.size} ticket(s) abierto(s). Cierra alguno antes.`)],
      ephemeral: true
    });
  }

  const nameVars = {
    user: interaction.user.username,
    categoria: cat.id,
    numero: (guild.channels.cache.filter(c => c.name.startsWith('ticket-')).size + 1).toString()
  };
  const channelName = fillTemplate(cfg.advanced.nameFormat, nameVars).toLowerCase().slice(0, 90);

  const viewRoles = cfg.permissions.view.filter(r => guild.roles.cache.has(r));

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] }
  ];
  for (const r of viewRoles) {
    overwrites.push({ id: r, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] });
  }
  if (cat.staffRole && guild.roles.cache.has(cat.staffRole)) {
    overwrites.push({ id: cat.staffRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] });
  }

  const ch = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: config.channels.tickets || null,
    topic: `owner:${interaction.user.id}|cat:${cat.id}`,
    permissionOverwrites: overwrites
  });

  const welcomeMsg = fillTemplate(cfg.messages.welcome, {
    user: `<@${interaction.user.id}>`,
    staff: viewRoles.map(r => `<@&${r}>`).join(' ') || '@staff',
    ticket: ch.name,
    categoria: cat.name,
    server: guild.name
  });

  const embed = new EmbedBuilder()
    .setColor(cfg.appearance.color || '#E11D2E')
    .setTitle(`${cat.emoji} ${cat.name}`)
    .setDescription(welcomeMsg);

  const rows = [];
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket:close').setLabel('Cerrar').setEmoji('🔒').setStyle(ButtonStyle.Danger)
  );
  if (cfg.advanced.notifyButton) {
    buttons.addComponents(
      new ButtonBuilder().setCustomId('ticket:claim').setLabel('Reclamar').setEmoji('✋').setStyle(ButtonStyle.Primary)
    );
  }
  rows.push(buttons);

  await ch.send({ content: `<@${interaction.user.id}> ${viewRoles.map(r => `<@&${r}>`).join(' ')}`, embeds: [embed], components: rows });

  // MD al usuario
  try {
    const dmMsg = fillTemplate(cfg.messages.dm, { ticket: ch.name, server: guild.name, user: interaction.user.username });
    await interaction.user.send({ embeds: [embeds.info(dmMsg)] });
  } catch {}

  return interaction.reply({ embeds: [embeds.success(`Ticket creado: ${ch}`)], ephemeral: true });
}

async function closeTicket(interaction) {
  const ch = interaction.channel;
  const cfg = db.get();
  const guild = interaction.guild;

  const messages = await ch.messages.fetch({ limit: 100 }).catch(() => null);
  const transcript = messages
    ? messages.reverse().map(m => `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${m.content}`).join('\n')
    : 'Sin mensajes';

  if (cfg.logs.transcript && cfg.logs.channel) {
    const logCh = guild.channels.cache.get(cfg.logs.channel);
    if (logCh) {
      const closeMsg = fillTemplate(cfg.messages.close, { staff: interaction.user.username, ticket: ch.name });
      await logCh.send({
        embeds: [embeds.info(`Ticket **${ch.name}** cerrado por ${interaction.user.tag}\n${closeMsg}`)],
        files: [{ attachment: Buffer.from(transcript || 'Sin mensajes', 'utf8'), name: `${ch.name}.${cfg.logs.format || 'txt'}` }]
      }).catch(() => {});
    }
  }

  await interaction.reply({ embeds: [embeds.warn('Cerrando ticket en 5 segundos...')] });
  if (cfg.logs.deleteChannel) {
    setTimeout(() => ch.delete().catch(() => {}), 5000);
  } else {
    await ch.setName(`cerrado-${ch.name}`.slice(0, 90)).catch(() => {});
    await ch.permissionOverwrites.edit(guild.roles.everyone.id, { SendMessages: false }).catch(() => {});
  }
}

async function claimTicket(interaction) {
  const ch = interaction.channel;
  await ch.setTopic(`${ch.topic || ''} | claimed:${interaction.user.id}`).catch(() => {});
  return interaction.reply({ embeds: [embeds.success(`Ticket reclamado por ${interaction.user}.`)] });
}

module.exports = { openTicket, closeTicket, claimTicket };

async function claimTicket(interaction) {
  const ch = interaction.channel;
  await ch.setTopic(`${ch.topic || ''} | claimed:${interaction.user.id}`).catch(() => {});
  return interaction.reply({ embeds: [embeds.success(`Ticket reclamado por ${interaction.user}.`)] });
}

module.exports = { openTicket, closeTicket, claimTicket };
