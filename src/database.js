const fs=require('node:fs'),path=require('node:path'),Database=require('better-sqlite3');
const dir=path.resolve(process.env.DATA_DIR||path.join(process.cwd(),'data')); fs.mkdirSync(dir,{recursive:true});
const db=new Database(path.join(dir,'datashop.sqlite')); db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS settings(guild_id TEXT PRIMARY KEY,prefix TEXT DEFAULT '!',store_name TEXT DEFAULT 'DATASHOP',currency TEXT DEFAULT '$',color TEXT DEFAULT '#7c3aed',ticket_category TEXT,ticket_logs TEXT,staff_role TEXT,ticket_count INTEGER DEFAULT 0,welcome_channel TEXT,automod_links INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,name TEXT NOT NULL,description TEXT DEFAULT '',price REAL NOT NULL CHECK(price>=0),stock INTEGER DEFAULT -1 CHECK(stock>=-1),active INTEGER DEFAULT 1,UNIQUE(guild_id,name));
CREATE TABLE IF NOT EXISTS tickets(channel_id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,owner_id TEXT NOT NULL,claimed_by TEXT,status TEXT DEFAULT 'open');
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,product_name TEXT NOT NULL,quantity INTEGER NOT NULL,total REAL NOT NULL,status TEXT DEFAULT 'completado',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS warnings(id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,moderator_id TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS ranks(id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,name TEXT NOT NULL,minimum REAL NOT NULL,UNIQUE(guild_id,name));
CREATE TABLE IF NOT EXISTS customers(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,spent REAL DEFAULT 0,purchases INTEGER DEFAULT 0,PRIMARY KEY(guild_id,user_id));
CREATE TABLE IF NOT EXISTS methods(id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,name TEXT NOT NULL,instructions TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS giveaways(message_id TEXT PRIMARY KEY,guild_id TEXT NOT NULL,channel_id TEXT NOT NULL,prize TEXT NOT NULL,ends_at INTEGER NOT NULL,winners INTEGER DEFAULT 1,ended INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS giveaway_entries(message_id TEXT NOT NULL,user_id TEXT NOT NULL,PRIMARY KEY(message_id,user_id),FOREIGN KEY(message_id) REFERENCES giveaways(message_id) ON DELETE CASCADE);
`);
const settings=(id)=>{db.prepare('INSERT OR IGNORE INTO settings(guild_id) VALUES(?)').run(id);return db.prepare('SELECT * FROM settings WHERE guild_id=?').get(id)};
const allowed=new Set(['prefix','store_name','currency','color','ticket_category','ticket_logs','staff_role','welcome_channel','automod_links']);
const set=(id,key,value)=>{if(!allowed.has(key))throw Error('Ajuste no permitido');db.prepare('UPDATE settings SET '+key+'=? WHERE guild_id=?').run(value,id)};
module.exports={db,settings,set,close:()=>db.close()};
