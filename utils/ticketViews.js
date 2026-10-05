const {
  EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle
} = require('discord.js');
const db = require('./ticketsDb');

// ═══════════════ PANEL MAESTRO ═══════════════
function mainView() {
  const embed = new EmbedBuilder()
    .setColor(0xE11D2E)
    .setTitle('🎛️ Configuración de Tickets — Velo Studio')
    .setDescription(
      '**Panel maestro.** Selecciona una sección para editar 👇\n\n' +
      '🎨 **Apariencia** — título, descripción, color, imagen\n' +
      '📁 **Categorías** — añadir / quitar / editar\n' +
      '💬 **Mensajes** — bienvenida, cierre, transcripción\n' +
      '🔐 **Permisos** — quién puede qué\n' +
      '📥 **Logs** — canal, formato, transcripción\n' +
      '⚙️ **Avanzado** — prioridad, rating, límites'
    )
    .setFooter({ text: 'Velo Studio © 2026 — Panel de configuración' })
    .setTimestamp();

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticketcfg:main')
    .setPlaceholder('Selecciona una sección...')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('Apariencia').setDescription('Título, descripción, color, imagen').setValue('appearance').setEmoji('🎨'),
      new StringSelectMenuOptionBuilder().setLabel('Categorías').setDescription('Añadir / quitar / editar categorías').setValue('categories').setEmoji('📁'),
      new StringSelectMenuOptionBuilder().setLabel('Mensajes').setDescription('Bienvenida, cierre, transcripción').setValue('messages').setEmoji('💬'),
      new StringSelectMenuOptionBuilder().setLabel('Permisos').setDescription('Quién puede ver/cerrar/reclamar').setValue('permissions').setEmoji('🔐'),
      new StringSelectMenuOptionBuilder().setLabel('Logs').setDescription('Canal, formato, transcripción').setValue('logs').setEmoji('📥'),
      new StringSelectMenuOptionBuilder().setLabel('Avanzado').setDescription('Prioridad, rating, límites').setValue('advanced').setEmoji('⚙️')
    );

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticketcfg:preview').setLabel('Previsualizar').setEmoji('👁️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ticketcfg:save').setLabel('Guardar y publicar').setEmoji('💾').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ticketcfg:reset').setLabel('Resetear').setEmoji('♻️').setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu), buttons] };
}

// ═══════════════ APARIENCIA ═══════════════
function appearanceView() {
  const c = db.get().appearance;
  const embed = new EmbedBuilder()
    .setColor(0xE11D2E)
    .setTitle('🎨 Apariencia del panel de tickets')
    .setDescription('Elige qué editar 👇')
    .addFields(
      { name: '📌 Título', value: c.title || '*vacío*', inline: false },
      { name: '📝 Descripción', value: c.description || '*vacía*', inline: false },
      { name: '🎨 Color', value: c.color || '#E11D2E', inline: true },
      { name: '🔘 Botón', value: c.buttonText || 'Selecciona categoría', inline: true },
      { name: '📌 Footer', value: c.footer || '*vacío*', inline: false },
      { name: '🖼️ Imagen', value: c.image || '*ninguna*', inline: true },
      { name: '🖼️ Thumbnail', value: c.thumbnail || '*ninguno*', inline: true }
    );

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticketcfg:appearance')
    .setPlaceholder('¿Qué quieres editar?')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('Título').setValue('title').setEmoji('📌'),
      new StringSelectMenuOptionBuilder().setLabel('Descripción').setValue('description').setEmoji('📝'),
      new StringSelectMenuOptionBuilder().setLabel('Color').setValue('color').setEmoji('🎨'),
      new StringSelectMenuOptionBuilder().setLabel('Botón').setValue('buttonText').setEmoji('🔘'),
      new StringSelectMenuOptionBuilder().setLabel('Footer').setValue('footer').setEmoji('📌'),
      new StringSelectMenuOptionBuilder().setLabel('Imagen').setValue('image').setEmoji('🖼️'),
      new StringSelectMenuOptionBuilder().setLabel('Thumbnail').setValue('thumbnail').setEmoji('🖼️')
    );

  const back = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticketcfg:back').setLabel('Volver').setEmoji('⬅️').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu), back] };
}

// ═══════════════ CATEGORÍAS ═══════════════
function categoriesView() {
  const list = db.get().categories
    .sort((a, b) => a.order - b.order)
    .map(c => `${c.emoji} **${c.name}** — ${c.description} (\`${c.id}\`)`)
    .join('\n') || '*Sin categorías*';

  const embed = new EmbedBuilder()
    .setColor(0xE11D2E)
    .setTitle('📁 Categorías de tickets')
    .setDescription(list);

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticketcfg:categories')
    .setPlaceholder('¿Qué quieres hacer?')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('Añadir categoría').setValue('add').setEmoji('➕'),
      new StringSelectMenuOptionBuilder().setLabel('Editar categoría').setValue('edit').setEmoji('✏️'),
      new StringSelectMenuOptionBuilder().setLabel('Eliminar categoría').setValue('remove').setEmoji('❌'),
      new StringSelectMenuOptionBuilder().setLabel('Reordenar').setValue('reorder').setEmoji('🔀')
    );

  const back = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticketcfg:back').setLabel('Volver').setEmoji('⬅️').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu), back] };
}

// ═══════════════ MENSAJES ═══════════════
function messagesView() {
  const m = db.get().messages;
  const embed = new EmbedBuilder()
    .setColor(0xE11D2E)
    .setTitle('💬 Mensajes automáticos')
    .setDescription('Variables disponibles: `{user}`, `{staff}`, `{ticket}`, `{categoria}`, `{server}`')
    .addFields(
      { name: '👋 Bienvenida', value: m.welcome || '*vacío*' },
      { name: '🔒 Cierre', value: m.close || '*vacío*' },
      { name: '📄 Transcripción', value: m.transcript || '*vacío*' },
      { name: '📩 MD al usuario', value: m.dm || '*vacío*' },
      { name: '⏰ Inactividad', value: m.idle || '*vacío*' }
    );

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticketcfg:messages')
    .setPlaceholder('¿Qué mensaje editar?')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('Bienvenida').setValue('welcome').setEmoji('👋'),
      new StringSelectMenuOptionBuilder().setLabel('Cierre').setValue('close').setEmoji('🔒'),
      new StringSelectMenuOptionBuilder().setLabel('Transcripción').setValue('transcript').setEmoji('📄'),
      new StringSelectMenuOptionBuilder().setLabel('MD al usuario').setValue('dm').setEmoji('📩'),
      new StringSelectMenuOptionBuilder().setLabel('Inactividad').setValue('idle').setEmoji('⏰')
    );

  const back = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticketcfg:back').setLabel('Volver').setEmoji('⬅️').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu), back] };
}

// ═══════════════ PERMISOS ═══════════════
function permissionsView() {
  const p = db.get().permissions;
  const fmt = (arr) => arr.map(r => `<@&${r}>`).join(', ') || '*ninguno*';
  const embed = new EmbedBuilder()
    .setColor(0xE11D2E)
    .setTitle('🔐 Permisos de tickets')
    .addFields(
      { name: '👁️ Ver tickets', value: fmt(p.view) },
      { name: '🔒 Cerrar tickets', value: fmt(p.close) },
      { name: '✋ Reclamar tickets', value: fmt(p.claim) },
      { name: '➕ Añadir usuarios', value: fmt(p.add) },
      { name: '🔔 Rol notificado', value: fmt(p.notify) }
    );

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticketcfg:permissions')
    .setPlaceholder('¿Qué permiso editar?')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('Ver tickets').setValue('view').setEmoji('👁️'),
      new StringSelectMenuOptionBuilder().setLabel('Cerrar tickets').setValue('close').setEmoji('🔒'),
      new StringSelectMenuOptionBuilder().setLabel('Reclamar tickets').setValue('claim').setEmoji('✋'),
      new StringSelectMenuOptionBuilder().setLabel('Añadir usuarios').setValue('add').setEmoji('➕'),
      new StringSelectMenuOptionBuilder().setLabel('Rol notificado').setValue('notify').setEmoji('🔔')
    );

  const back = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticketcfg:back').setLabel('Volver').setEmoji('⬅️').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu), back] };
}

// ═══════════════ LOGS ═══════════════
function logsView() {
  const l = db.get().logs;
  const embed = new EmbedBuilder()
    .setColor(0xE11D2E)
    .setTitle('📥 Logs y transcripciones')
    .addFields(
      { name: '📥 Canal', value: l.channel ? `<#${l.channel}>` : '*no configurado*', inline: true },
      { name: '📄 Formato', value: l.format, inline: true },
      { name: '📝 Transcripción', value: l.transcript ? '✅ Activada' : '❌ Desactivada', inline: true },
      { name: '🗑️ Borrar canal al cerrar', value: l.deleteChannel ? '✅ Sí' : '❌ No', inline: true }
    );

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticketcfg:logs')
    .setPlaceholder('¿Qué editar?')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('Canal de logs').setValue('channel').setEmoji('📥'),
      new StringSelectMenuOptionBuilder().setLabel('Formato (.txt/.html/.json)').setValue('format').setEmoji('📄'),
      new StringSelectMenuOptionBuilder().setLabel('Activar/desactivar transcripción').setValue('transcript').setEmoji('📝'),
      new StringSelectMenuOptionBuilder().setLabel('Borrar canal al cerrar').setValue('deleteChannel').setEmoji('🗑️')
    );

  const back = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticketcfg:back').setLabel('Volver').setEmoji('⬅️').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu), back] };
}

// ═══════════════ AVANZADO ═══════════════
function advancedView() {
  const a = db.get().advanced;
  const embed = new EmbedBuilder()
    .setColor(0xE11D2E)
    .setTitle('⚙️ Ajustes avanzados')
    .addFields(
      { name: '⭐ Prioridad', value: a.priority ? '✅' : '❌', inline: true },
      { name: '🌟 Rating', value: a.rating ? '✅' : '❌', inline: true },
      { name: '🔔 Botón notificar staff', value: a.notifyButton ? '✅' : '❌', inline: true },
      { name: '🔢 Máx. tickets/usuario', value: `${a.maxPerUser}`, inline: true },
      { name: '📛 Formato de nombre', value: `\`${a.nameFormat}\``, inline: false },
      { name: '⏰ Auto-cerrar (min)', value: a.autoClose === 0 ? 'Desactivado' : `${a.autoClose} min`, inline: true }
    );

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticketcfg:advanced')
    .setPlaceholder('¿Qué editar?')
    .addOptions(
      new StringSelectMenuOptionBuilder().setLabel('Prioridad on/off').setValue('priority').setEmoji('⭐'),
      new StringSelectMenuOptionBuilder().setLabel('Rating on/off').setValue('rating').setEmoji('🌟'),
      new StringSelectMenuOptionBuilder().setLabel('Botón notificar on/off').setValue('notifyButton').setEmoji('🔔'),
      new StringSelectMenuOptionBuilder().setLabel('Máx. tickets por usuario').setValue('maxPerUser').setEmoji('🔢'),
      new StringSelectMenuOptionBuilder().setLabel('Formato del nombre del canal').setValue('nameFormat').setEmoji('📛'),
      new StringSelectMenuOptionBuilder().setLabel('Auto-cerrar por inactividad').setValue('autoClose').setEmoji('⏰')
    );

  const back = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticketcfg:back').setLabel('Volver').setEmoji('⬅️').setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu), back] };
}

// ═══════════════ HELPERS: subvistas ═══════════════
function buildCategoryEditMenu() {
  const cats = db.get().categories.sort((a, b) => a.order - b.order);
  if (!cats.length) return null;
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticketcfg:cat_edit_pick')
    .setPlaceholder('Categoría a editar')
    .addOptions(cats.map(c =>
      new StringSelectMenuOptionBuilder().setLabel(c.name).setDescription(c.description || '').setValue(c.id).setEmoji(c.emoji || '📁')
    ));
  const back = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticketcfg:back_cat').setLabel('Volver').setEmoji('⬅️').setStyle(ButtonStyle.Secondary)
  );
  return { components: [new ActionRowBuilder().addComponents(menu), back] };
}

function buildCategoryRemoveMenu() {
  const cats = db.get().categories.sort((a, b) => a.order - b.order);
  if (!cats.length) return null;
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticketcfg:cat_remove_pick')
    .setPlaceholder('Categoría a eliminar')
    .addOptions(cats.map(c =>
      new StringSelectMenuOptionBuilder().setLabel(c.name).setValue(c.id).setEmoji('❌')
    ));
  const back = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticketcfg:back_cat').setLabel('Volver').setEmoji('⬅️').setStyle(ButtonStyle.Secondary)
  );
  return { components: [new ActionRowBuilder().addComponents(menu), back] };
}

function buildCategoryReorderMenu() {
  const cats = db.get().categories.sort((a, b) => a.order - b.order);
  if (!cats.length) return null;
  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticketcfg:cat_reorder_pick')
    .setPlaceholder('Categoría a mover')
    .addOptions(cats.map(c =>
      new StringSelectMenuOptionBuilder().setLabel(c.name).setValue(c.id).setEmoji(c.emoji || '📁')
    ));
  const back = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticketcfg:back_cat').setLabel('Volver').setEmoji('⬅️').setStyle(ButtonStyle.Secondary)
  );
  return { components: [new ActionRowBuilder().addComponents(menu), back] };
}

// ═══════════════ PANEL PÚBLICO (el que ven los users) ═══════════════
function publicPanel() {
  const cfg = db.get();
  const a = cfg.appearance;
  const embed = new EmbedBuilder()
    .setColor(a.color || '#E11D2E')
    .setTitle(a.title || '🎫 Soporte')
    .setDescription(a.description || 'Selecciona una categoría')
    .setFooter({ text: a.footer || 'Velo Studio © 2026' });

  if (a.image) embed.setImage(a.image);
  if (a.thumbnail) embed.setThumbnail(a.thumbnail);

  const cats = cfg.categories.sort((a, b) => a.order - b.order).slice(0, 25);
  if (!cats.length) return { embeds: [embed], components: [] };

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket:open')
    .setPlaceholder(a.buttonText || 'Selecciona categoría')
    .addOptions(cats.map(c =>
      new StringSelectMenuOptionBuilder()
        .setLabel(c.name)
        .setDescription((c.description || '').slice(0, 100))
        .setValue(c.id)
        .setEmoji(c.emoji || '📁')
    ));

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

// ═══════════════ PREVIEW (solo para el admin) ═══════════════
function previewView() {
  const cfg = db.get();
  const a = cfg.appearance;
  const embed = new EmbedBuilder()
    .setColor(a.color || '#E11D2E')
    .setTitle('👁️ PREVIEW — ' + (a.title || '🎫 Soporte'))
    .setDescription(a.description || 'Selecciona una categoría')
    .setFooter({ text: 'PREVIEW — ' + (a.footer || 'Velo Studio © 2026') });

  if (a.image) embed.setImage(a.image);
  if (a.thumbnail) embed.setThumbnail(a.thumbnail);

  const cats = cfg.categories.sort((x, y) => x.order - y.order).slice(0, 25);
  const rows = [];
  if (cats.length) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('ticket:preview_noop')
      .setPlaceholder(a.buttonText || 'Selecciona categoría')
      .addOptions(cats.map(c =>
        new StringSelectMenuOptionBuilder()
          .setLabel(c.name)
          .setDescription((c.description || '').slice(0, 100))
          .setValue(c.id)
          .setEmoji(c.emoji || '📁')
      ));
    rows.push(new ActionRowBuilder().addComponents(menu));
  }

  const back = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticketcfg:back').setLabel('Volver al panel').setEmoji('⬅️').setStyle(ButtonStyle.Secondary)
  );
  rows.push(back);

  return { embeds: [embed], components: rows };
}

module.exports = {
  mainView,
  appearanceView,
  categoriesView,
  messagesView,
  permissionsView,
  logsView,
  advancedView,
  buildCategoryEditMenu,
  buildCategoryRemoveMenu,
  buildCategoryReorderMenu,
  publicPanel,
  previewView
};
