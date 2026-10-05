const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'tickets.json');

const DEFAULT = {
  appearance: {
    title: '🎫 Velo Studio — Soporte',
    description: 'Selecciona una categoría para abrir un ticket',
    color: '#E11D2E',
    image: null,
    thumbnail: null,
    footer: 'Velo Studio © 2026',
    buttonText: 'Selecciona categoría'
  },
  categories: [
    {
      id: 'soporte',
      name: 'Soporte',
      emoji: '🎫',
      description: 'Ayuda general',
      staffRole: '1552119717597028515',
      order: 1
    },
    {
      id: 'compras',
      name: 'Compras',
      emoji: '💰',
      description: 'Comprar productos',
      staffRole: '1552119717597028515',
      order: 2
    }
  ],
  messages: {
    welcome:    'Hola {user}, cuéntanos tu problema con detalle.',
    close:      'Ticket cerrado por {staff}. Se borrará en 5 segundos...',
    transcript: '📄 Transcripción del ticket {ticket}',
    dm:         'Tu ticket {ticket} ha sido abierto en {server}.',
    idle:       '⚠️ Este ticket cerrará en 1h por inactividad.'
  },
  permissions: {
    view:   ['1552119717597028515'],
    close:  ['1552119717597028515'],
    claim:  ['1552119717597028515'],
    add:    ['1552119717597028515'],
    notify: ['1552119717597028515']
  },
  logs: {
    channel: '1550131492578132010',
    format: 'txt',
    transcript: true,
    deleteChannel: true
  },
  advanced: {
    priority: false,
    rating: false,
    maxPerUser: 1,
    nameFormat: 'ticket-{categoria}-{user}',
    autoClose: 0,
    notifyButton: true
  }
};

function ensureDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  ensureDir();
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT, null, 2));
    return JSON.parse(JSON.stringify(DEFAULT));
  }
  const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  // merge con defaults por si faltan claves nuevas
  return deepMerge(JSON.parse(JSON.stringify(DEFAULT)), data);
}

function deepMerge(target, source) {
  for (const k in source) {
    if (source[k] && typeof source[k] === 'object' && !Array.isArray(source[k])) {
      target[k] = deepMerge(target[k] || {}, source[k]);
    } else {
      target[k] = source[k];
    }
  }
  return target;
}

let cache = load();

function save() {
  ensureDir();
  fs.writeFileSync(DB_PATH, JSON.stringify(cache, null, 2));
}

module.exports = {
  get: () => cache,
  reload: () => { cache = load(); return cache; },
  save,
  reset: () => { cache = JSON.parse(JSON.stringify(DEFAULT)); save(); return cache; },
  update: (patch) => { cache = deepMerge(cache, patch); save(); return cache; },

  // helpers de categorías
  addCategory(cat) {
    const id = cat.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `cat${Date.now()}`;
    cat.id = id;
    cat.order = (cache.categories.at(-1)?.order || 0) + 1;
    cache.categories.push(cat);
    save();
    return cat;
  },
  removeCategory(id) {
    cache.categories = cache.categories.filter(c => c.id !== id);
    save();
  },
  editCategory(id, patch) {
    const cat = cache.categories.find(c => c.id === id);
    if (!cat) return null;
    Object.assign(cat, patch);
    save();
    return cat;
  },
  moveCategory(id, dir) {
    const idx = cache.categories.findIndex(c => c.id === id);
    if (idx === -1) return;
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= cache.categories.length) return;
    [cache.categories[idx], cache.categories[swap]] = [cache.categories[swap], cache.categories[idx]];
    cache.categories.forEach((c, i) => c.order = i + 1);
    save();
  }
};
