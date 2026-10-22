require("dotenv").config();
const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId || !guildId) {
  throw new Error("Faltan DISCORD_TOKEN, CLIENT_ID o GUILD_ID en las variables de entorno.");
}

const ignoredRootFiles = new Set(["index.js", "config.js", "deploy-commands.js", "buttons.js"]);
function discoverCommandFiles() {
  const rootFiles = fs.readdirSync(__dirname)
    .filter(file => file.endsWith(".js") && !ignoredRootFiles.has(file))
    .map(file => path.join(__dirname, file));
  const nestedFiles = [];
  const commandsDirectory = path.join(__dirname, "commands");
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile() && entry.name.endsWith(".js")) nestedFiles.push(fullPath);
    }
  }
  if (fs.existsSync(commandsDirectory)) walk(commandsDirectory);
  return [...rootFiles, ...nestedFiles];
}

async function main() {
  const commands = [];
  const seen = new Set();
  for (const filePath of discoverCommandFiles()) {
    try {
      const commandModule = require(filePath);
      if (!commandModule.data || typeof commandModule.data.toJSON !== "function") continue;
      const command = commandModule.data.toJSON();
      if (seen.has(command.name)) {
        console.error("Comando duplicado omitido:", command.name, "en", path.relative(__dirname, filePath));
        continue;
      }
      seen.add(command.name);
      commands.push(command);
    } catch (error) {
      console.error("No se pudo cargar", path.relative(__dirname, filePath), error);
      throw error;
    }
  }
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  console.log("Comandos slash registrados:", commands.length);
}
main().catch(error => {
  console.error("Falló el registro de comandos:", error);
  process.exitCode = 1;
});
