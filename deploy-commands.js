require("dotenv").config();
const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");
const token = process.env.DISCORD_TOKEN, clientId = process.env.CLIENT_ID, guildId = process.env.GUILD_ID;
if (!token || !clientId || !guildId) throw new Error("Faltan variables de entorno.");
const commands = [];
for (const file of fs.readdirSync(__dirname).filter(f => f.endsWith(".js") && !["index.js","config.js","deploy-commands.js","buttons.js"].includes(f))) {
  const c = require(path.join(__dirname,file)); if (c.data) commands.push(c.data.toJSON());
}
(async () => {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId,guildId), { body: commands });
  console.log("Comandos registrados.");
})();
