const {
  ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, EmbedBuilder
} = require('discord.js');
const db = require('../utils/ticketsDb');
const embeds = require('../utils/embeds');

function fillTemplate(str, vars) {
  return str.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

async function openTicket(interaction) {
  const catId = interaction.values[0];
  const cfg = db.get();
  const cat = cfg.categories.find(c => c.id === catId);
  if (!cat) return interaction.reply({ embeds: [embeds.error('Categoría no encontrada.')], ephemeral: true });

  const guild = interaction.guild;

  // Comprobar tickets abiertos del user
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
    parent: require('../config').channels.tickets || null,
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
  const buttons = new ActionRowBuilder().add
