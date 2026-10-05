const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const views = require('../../utils/ticketViews');

module.exports = {
  category: 'Tickets',
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Sistema de tickets')
    .addSubcommand(s => s.setName('config').setDescription('🎛️ Panel de configuración de tickets'))
    .addSubcommand(s => s.setName('setup').setDescription('Publica el panel público de tickets en este canal'))
    .addSubcommand(s => s.setName('close').setDescription('🔒 Cierra el ticket actual'))
    .addSubcommand(s => s.setName('add').setDescription('Añade un usuario al ticket')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true)))
    .addSubcommand(s => s.setName('remove').setDescription('Quita un usuario del ticket')
      .addUserOption(o => o.setName('usuario').setDescription('Usuario').setRequired(true)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'config') {
      const view = views.mainView();
      return interaction.reply({ ...view, ephemeral: true });
    }

    if (sub === 'setup') {
      const panel = views.publicPanel();
      return interaction.reply({ content: '✅ Panel publicado.', ephemeral: true })
        .then(() => interaction.channel.send(panel));
    }

    if (sub === 'close')   return require('../../events/ticketHandler').closeTicket(interaction);
    if (sub === 'add')     return require('../../events/ticketHandler').addUser(interaction);
    if (sub === 'remove')  return require('../../events/ticketHandler').removeUser(interaction);
  }
};
