require("dotenv").config();
const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");
const token = process.env.DISCORD_TOKEN, clientId = process.env.CLIENT_ID, guildId = process.env.GUILD_ID;
if (!token || !clientId || !guildId) throw new Error("Faltan variables de entorno.");
const commands = [];
const seen = new Set();
for (const file of fs.readdirSync(__dirname).filter(f => f.endsWith(".js") && !["index.js","config.js","deploy-commands.js","buttons.js"].includes(f))) {
  const c = require(path.join(__dirname,file));
  const entries = Array.isArray(c.setupCommands) ? c.setupCommands : (c.data ? [c.data] : []);
  for (const entry of entries) {
    if (!entry || typeof entry.toJSON !== "function") continue;
    const command = entry.toJSON();
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
