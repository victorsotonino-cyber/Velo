const { Client, GatewayIntentBits, Partials, Collection } = require("discord.js");
const fs = require("fs");
const path = require("path");
const config = require("./config");

if (!config.token) {
  console.error("Falta DISCORD_TOKEN en Railway.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

client.commands = new Collection();
client.afkUsers = new Map();
client.messageCounts = new Map();

function discoverCommandFiles() {
  const ignored = new Set(["index.js", "config.js", "deploy-commands.js", "buttons.js"]);
  const rootFiles = fs.readdirSync(__dirname)
    .filter(file => file.endsWith(".js") && !ignored.has(file))
    .map(file => path.join(__dirname, file));
  const nestedFiles = [];
  const commandsRoot = path.join(__dirname, "commands");

  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile() && entry.name.endsWith(".js")) nestedFiles.push(fullPath);
    }
  }

  if (fs.existsSync(commandsRoot)) walk(commandsRoot);
  return [...rootFiles, ...nestedFiles];
}

for (const filePath of discoverCommandFiles()) {
  try {
    const command = require(filePath);
    if (command.data && command.execute) {
      const name = command.data.name;
      if (client.commands.has(name)) {
        console.error("Comando duplicado ignorado:", name, "en", path.relative(__dirname, filePath), "(ya existe uno registrado)");
        continue;
      }
      client.commands.set(name, command);
    }
  } catch (e) {
    console.error("Error cargando " + path.relative(__dirname, filePath) + ":", e);
  }
}

function loadEvents() {
  const eventsRoot = path.join(__dirname, "events");
  if (!fs.existsSync(eventsRoot)) throw new Error("No existe la carpeta events/.");
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile() && entry.name.endsWith(".js")) files.push(fullPath);
    }
  }
  walk(eventsRoot);
  for (const filePath of files.sort()) {
    try {
      const registerEvent = require(filePath);
      if (typeof registerEvent !== "function") throw new TypeError("El archivo de evento debe exportar una función.");
      registerEvent(client);
    } catch (error) {
      console.error("Error cargando evento " + path.relative(__dirname, filePath) + ":", error);
      throw error;
    }
  }
}

loadEvents();
require("./buttons")(client);


 — se ejecutan como acciones reales, no como alias vacíos.
process.on("unhandledRejection", error => console.error("Unhandled rejection:", error));
process.on("uncaughtException", error => console.error("Uncaught exception:", error));

async function shutdown(signal) {
  console.log("Cerrando Velo por " + signal + "...");
  try { client.destroy(); } finally { process.exit(0); }
}
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

client.login(config.token).catch(error => {
  console.error("No se pudo iniciar sesión en Discord:", error?.message || error);
  process.exit(1);
});
