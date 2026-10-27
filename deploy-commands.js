require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { REST, Routes } = require("discord.js");

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error("Faltan DISCORD_TOKEN, CLIENT_ID o GUILD_ID en las variables de entorno.");
  process.exit(1);
}

const commandsPath = path.join(__dirname, "src", "commands");
const commands = [];
const seen = new Set();
for (const file of fs.readdirSync(commandsPath).filter(name => name.endsWith(".js"))) {
  const command = require(path.join(commandsPath, file));
  if (!command.data?.toJSON) continue;
  const json = command.data.toJSON();
  if (seen.has(json.name)) throw new Error(`Comando duplicado: ${json.name}`);
  seen.add(json.name);
  commands.push(json);
}

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands })
  .then(() => console.log(`DATASHOP: ${commands.length} comandos slash registrados.`))
  .catch(error => {
    console.error("No se pudieron registrar los comandos de DATASHOP:", error);
    process.exitCode = 1;
  });
