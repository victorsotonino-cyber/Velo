require("dotenv").config();
const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");
const token = process.env.DISCORD_TOKEN, clientId = process.env.CLIENT_ID, guildId = process.env.GUILD_ID;
if (!token || !clientId || !guildId) throw new Error("Faltan variables de entorno.");
const commands = [];
const seen = new Set();

function normalizeCommandOptions(command) {
  if (!command || !Array.isArray(command.options)) return command;
  command.options = command.options
    .map((option, index) => ({ option: normalizeCommandOptions(option), index }))
    .sort((a, b) => Number(Boolean(b.option.required)) - Number(Boolean(a.option.required)) || a.index - b.index)
    .map(entry => entry.option);
  return command;
}
for (const file of fs.readdirSync(__dirname).filter(f => f.endsWith(".js") && !["index.js","config.js","deploy-commands.js","buttons.js"].includes(f))) {
  const c = require(path.join(__dirname,file));
  const entries = Array.isArray(c.setupCommands) ? c.setupCommands : (c.data ? [c.data] : []);
  for (const entry of entries) {
    if (!entry || typeof entry.toJSON !== "function") continue;
    const command = normalizeCommandOptions(entry.toJSON());
    if (seen.has(command.name)) {
      console.error("Comando duplicado omitido:", command.name, "en", file);
      continue;
    }
    seen.add(command.name);
    commands.push(command);
  }
}
(async () => {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId,guildId), { body: commands });
  console.log("Comandos registrados.");
})();
