const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.VELO_DATA_DIR || path.join(__dirname, "data");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function safeName(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function readJSON(name, fallback) {
  ensureDir();
  const file = path.join(DATA_DIR, safeName(name));
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    try {
      return JSON.parse(fs.readFileSync(file + ".bak", "utf8"));
    } catch {
      return fallback;
    }
  }
}

function writeJSON(name, value) {
  ensureDir();
  const file = path.join(DATA_DIR, safeName(name));
  const temp = file + ".tmp";
  const backup = file + ".bak";
  const payload = JSON.stringify(value, null, 2) + "\n";

  fs.writeFileSync(temp, payload, "utf8");
  if (fs.existsSync(file)) fs.copyFileSync(file, backup);
  fs.renameSync(temp, file);
  return true;
}

module.exports = { DATA_DIR, readJSON, writeJSON };
