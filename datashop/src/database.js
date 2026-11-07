const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const filename = process.env.DB_FILE || path.join(process.cwd(), 'data', 'datashop.sqlite');
fs.mkdirSync(path.dirname(filename), {recursive:true});
const db = new Database(filename);
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS guild_config (
  guild_id TEXT PRIMARY KEY,
  config TEXT NOT NULL,
  updated_at INTEGER NOT NULL
)`);
const getRow = db.prepare('SELECT config FROM guild_config WHERE guild_id = ?');
const putRow = db.prepare(`INSERT INTO guild_config(guild_id,config,updated_at) VALUES(?,?,?)
ON CONFLICT(guild_id) DO UPDATE SET config=excluded.config,updated_at=excluded.updated_at`);
const defaults = () => ({
  store:{name:'DATASHOP',color:'#e11d2e',currency:'$'},
  channels:{tickets:null,logs:null,shop:null,methods:null,suggestions:null,vouches:null},
  roles:{owner:null,admin:null,staff:null,member:null},
  ticket:{max:3,counter:0,types:['Soporte','Comprar','Reclaim','Otros']},
  products:[],methods:[],orders:[],customers:{},sales:0,warns:{},
  automod:{links:true,spam:true,badwords:[]}
});
const cache = new Map();
function merge(target, source) {
  for (const [key,value] of Object.entries(source)) {
    if (target[key] === undefined) target[key] = structuredClone(value);
    else if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object') merge(target[key],value);
  }
  return target;
}
function get(guildId) {
  if (!cache.has(guildId)) {
    const row = getRow.get(guildId);
    let stored = {};
    if (row) { try { stored = JSON.parse(row.config); } catch (error) { console.error('Configuración inválida:',guildId,error.message); } }
    cache.set(guildId,merge(stored,defaults()));
  }
  return cache.get(guildId);
}
function save(guildId) {
  const entries = guildId ? [[guildId,cache.get(guildId)]] : [...cache.entries()];
  for (const [id,value] of entries) if (value) putRow.run(id,JSON.stringify(value),Date.now());
}
function close() { save(); db.pragma('wal_checkpoint(PASSIVE)'); db.close(); }
module.exports = {get,save,close};
