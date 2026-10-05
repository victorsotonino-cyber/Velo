const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');

const db = require('../utils/ticketsDb');
const views = require('../utils/ticketViews');
const embeds = require('../utils/embeds');

module.exports = {
  name: 'interactionCreate',
  async execute(client, interaction) {
    try {
      // ─── SLASH COMMANDS
      if (interaction.isChatInputCommand()) {
        const cmd = client.commands.get(interaction.commandName);
        if (cmd) return cmd.execute(interaction, client);
        return;
      }

      const id = interaction.customId;

      // ─── SELECT MENUS
      if (interaction.isStringSelectMenu()) {
        if (id === 'ticketcfg:main') {
          const c = interaction.values[0];
          if (c === 'appearance')  return interaction.update(views.appearanceView());
          if (c === 'categories')  return interaction.update(views.categoriesView());
          if (c === 'messages')    return interaction.update(views.messagesView());
          if (c === 'permissions') return interaction.update(views.permissionsView());
          if (c === 'logs')        return interaction.update(views.logsView());
          if (c === 'advanced')    return interaction.update(views.advancedView());
        }

        if (id === 'ticketcfg:appearance') {
          const field = interaction.values[0];
          const modal = new ModalBuilder().setCustomId(`ticketcfg:modal:appearance:${field}`).setTitle(`Editar ${field}`.slice(0, 45));
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('value').setLabel(field).setStyle(field === 'description' ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(false).setMaxLength(1000)
          ));
          return interaction.showModal(modal);
        }

        if (id === 'ticketcfg:categories') {
          const c = interaction.values[0];
          if (c === 'add') {
            const modal = new ModalBuilder().setCustomId('ticketcfg:modal:cat_add').setTitle('Añadir categoría');
            modal.addComponents(
              new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nombre').setStyle(TextInputStyle.Short).setRequired(true)),
              new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji (ej: 🎫)').setStyle(TextInputStyle.Short).setRequired(false)),
              new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Descripción').setStyle(TextInputStyle.Short).setRequired(false)),
              new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('staffRole').setLabel('ID del rol de staff').setStyle(TextInputStyle.Short).setRequired(false))
            );
            return interaction.showModal(modal);
          }
          if (c === 'edit')   return interaction.update(views.editPickView());
          if (c === 'remove') return interaction.update(views.removePickView());
          if (c === 'reorder')return interaction.update(views.reorderPickView());
        }

        if (id === 'ticketcfg:cat_edit_pick') {
          const cat = db.get().categories.find(x => x.id === interaction.values[0]);
          if (!cat) return interaction.reply({ embeds: [embeds.error('No encontrada')], ephemeral: true });
          const modal = new ModalBuilder().setCustomId(`ticketcfg:modal:cat_edit:${cat.id}`).setTitle(`Editar ${cat.name}`.slice(0, 45));
          modal.addComponents(
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Nombre').setStyle(TextInputStyle.Short).setValue(cat.name).setRequired(true)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji').setStyle(TextInputStyle.Short).setValue(cat.emoji || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Descripción').setStyle(TextInputStyle.Short).setValue(cat.description || '').setRequired(false)),
            new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('staffRole').setLabel('ID del rol de staff').setStyle(TextInputStyle.Short).setValue(cat.staffRole || '').setRequired(false))
          );
          return interaction.showModal(modal);
        }

        if (id === 'ticketcfg:cat_remove_pick') {
          const cat = db.get().categories.find(x => x.id === interaction.values[0]);
          if (!cat) return interaction.reply({ embeds: [embeds.error('No encontrada')], ephemeral: true });
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ticketcfg:cat_remove_confirm:${cat.id}`).setLabel('Sí, eliminar').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
            new ButtonBuilder().setCustomId('ticketcfg:back_cat').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
          );
          return interaction.update({ embeds: [embeds.warn(`¿Eliminar **${cat.name}**?`)], components: [row] });
        }

        if (id === 'ticketcfg:cat_reorder_pick') {
          const catId = interaction.values[0];
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ticketcfg:cat_move:up:${catId}`).setLabel('Subir').setStyle(ButtonStyle.Primary).setEmoji('⬆️'),
            new ButtonBuilder().setCustomId(`ticketcfg:cat_move:down:${catId}`).setLabel('Bajar').setStyle(ButtonStyle.Primary).setEmoji('⬇️'),
            new ButtonBuilder().setCustomId('ticketcfg:back_cat').setLabel('Volver').setStyle(ButtonStyle.Secondary)
          );
          return interaction.update({ embeds: [embeds.info('Mueve la categoría:')], components: [row] });
        }

        if (id === 'ticketcfg:messages') {
          const key = interaction.values[0];
          const current = db.get().messages[key] || '';
          const modal = new ModalBuilder().setCustomId(`ticketcfg:modal:message:${key}`).setTitle(key);
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('value').setLabel('Mensaje').setStyle(TextInputStyle.Paragraph).setValue(current.slice(0, 1000)).setRequired(false)
          ));
          return interaction.showModal(modal);
        }

        if (id === 'ticketcfg:permissions') {
          const key = interaction.values[0];
          const current = (db.get().permissions[key] || []).join(', ');
          const modal = new ModalBuilder().setCustomId(`ticketcfg:modal:perm:${key}`).setTitle('Permisos');
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('value').setLabel('IDs de roles separados por coma').setStyle(TextInputStyle.Paragraph).setValue(current).setRequired(false)
          ));
          return interaction.showModal(modal);
        }

        if (id === 'ticketcfg:logs') {
          const key = interaction.values[0];
          if (key === 'transcript')    { db.update({ logs: { transcript: !db.get().logs.transcript } }); return interaction.update(views.logsView()); }
          if (key === 'deleteChannel') { db.update({ logs: { deleteChannel: !db.get().logs.deleteChannel } }); return interaction.update(views.logsView()); }
          const modal = new ModalBuilder().setCustomId(`ticketcfg:modal:log:${key}`).setTitle(key);
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('value').setLabel('Valor').setStyle(TextInputStyle.Short).setValue(String(db.get().logs[key] || '')).setRequired(false)
          ));
          return interaction.showModal(modal);
        }

        if (id === 'ticketcfg:advanced') {
          const key = interaction.values[0];
          if (['priority','rating','notifyButton'].includes(key)) {
            db.update({ advanced: { [key]: !db.get().advanced[key] } });
            return interaction.update(views.advancedView());
          }
          const modal = new ModalBuilder().setCustomId(`ticketcfg:modal:adv:${key}`).setTitle(key);
          modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('value').setLabel('Valor').setStyle(TextInputStyle.Short).setValue(String(db.get().advanced[key] ?? '')).setRequired(false)
          ));
          return interaction.showModal(modal);
        }

        if (id === 'ticket:open') return require('./ticketHandler').openTicket(interaction);
        if (id === 'ticket:preview_noop') return interaction.reply({ content: '👁️ Preview', ephemeral: true });
      }

      // ─── BUTTONS
      if (interaction.isButton()) {
        if (id === 'ticketcfg:back')     return interaction.update(views.mainView());
        if (id === 'ticketcfg:back_cat') return interaction.update(views.categoriesView());
        if (id === 'ticketcfg:preview')  return interaction.reply({ ...views.previewView(), ephemeral: true });

        if (id === 'ticketcfg:save') {
          const ch = interaction.guild.channels.cache.get(require('../config').channels.tickets);
          if (ch) await ch.send(views.publicPanel());
          return interaction.reply({ embeds: [embeds.success('Panel publicado.')], ephemeral: true });
        }

        if (id === 'ticketcfg:reset') {
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticketcfg:reset_confirm').setLabel('Sí, resetear').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('ticketcfg:back').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
          );
          return interaction.update({ embeds: [embeds.warn('¿Resetear toda la config?')], components: [row] });
        }

        if (id === 'ticketcfg:reset_confirm') { db.reset(); return interaction.update(views.mainView()); }

        if (id.startsWith('ticketcfg:cat_remove_confirm:')) {
          db.removeCategory(id.split(':')[2]);
          return interaction.update(views.categoriesView());
        }

        if (id.startsWith('ticketcfg:cat_move:')) {
          const [, , dir, catId] = id.split(':');
          db.moveCategory(catId, dir);
          return interaction.update(views.categoriesView());
        }

        if (id === 'ticket:close') return require('./ticketHandler').closeTicket(interaction);
        if (id === 'ticket:claim') return require('./ticketHandler').claimTicket(interaction);
      }

      // ─── MODALS
      if (interaction.isModalSubmit()) {
        if (id.startsWith('ticketcfg:modal:appearance:')) {
          const field = id.split(':')[3];
          db.update({ appearance: { [field]: interaction.fields.getTextInputValue('value') || null } });
          return interaction.reply({ embeds: [embeds.success(`**${field}** actualizado.`)], ephemeral: true });
        }

        if (id === 'ticketcfg:modal:cat_add') {
          db.addCategory({
            name: interaction.fields.getTextInputValue('name'),
            emoji: interaction.fields.getTextInputValue('emoji') || '📁',
            description: interaction.fields.getTextInputValue('description') || '',
            staffRole: interaction.fields.getTextInputValue('staffRole') || null
          });
          return interaction.reply({ embeds: [embeds.success('Categoría añadida.')], ephemeral: true });
        }

        if (id.startsWith('ticketcfg:modal:cat_edit:')) {
          db.editCategory(id.split(':')[3], {
            name: interaction.fields.getTextInputValue('name'),
            emoji: interaction.fields.getTextInputValue('emoji') || '📁',
            description: interaction.fields.getTextInputValue('description') || '',
            staffRole: interaction.fields.getTextInputValue('staffRole') || null
          });
          return interaction.reply({ embeds: [embeds.success('Categoría actualizada.')], ephemeral: true });
        }

        if (id.startsWith('ticketcfg:modal:message:')) {
          db.update({ messages: { [id.split(':')[3]]: interaction.fields.getTextInputValue('value') } });
          return interaction.reply({ embeds: [embeds.success('Mensaje actualizado.')], ephemeral: true });
        }

        if (id.startsWith('ticketcfg:modal:perm:')) {
          const arr = interaction.fields.getTextInputValue('value').split(',').map(s => s.trim().replace(/[<@&>]/g, '')).filter(Boolean);
          db.update({ permissions: { [id.split(':')[3]]: arr } });
          return interaction.reply({ embeds: [embeds.success('Permiso actualizado.')], ephemeral: true });
        }

        if (id.startsWith('ticketcfg:modal:log:')) {
          const key = id.split(':')[3];
          db.update({ logs: { [key]: interaction.fields.getTextInputValue('value') || null } });
          return interaction.reply({ embeds: [embeds.success('Log actualizado.')], ephemeral: true });
        }

        if (id.startsWith('ticketcfg:modal:adv:')) {
          const key = id.split(':')[3];
          const raw = interaction.fields.getTextInputValue('value').trim();
          const value = ['maxPerUser','autoClose'].includes(key) ? (parseInt(raw) || 0) : raw;
          db.update({ advanced: { [key]: value } });
          return interaction.reply({ embeds: [embeds.success('Ajuste actualizado.')], ephemeral: true });
        }
      }

    } catch (err) {
      console.error('[interactionCreate]', err);
      const payload = { embeds: [embeds.error('Ocurrió un error.')], ephemeral: true };
      if (interaction.replied || interaction.deferred) interaction.followUp(payload).catch(() => {});
      else interaction.reply(payload).catch(() => {});
    }
  }
};
