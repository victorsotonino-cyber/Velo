require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
function load(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) load(full);
    else if (item.name.endsWith('.js')) {
      const cmd = require(full);
      if (cmd.data) commands.push(cmd.data.toJSON());
    }
  }
}
load(path.join(__dirname, 'commands'));

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    const route = process.env.GUILD_ID
      ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
      : Routes.applicationCommands(process.env.CLIENT_ID);
    const data = await rest.put(route, { body: commands });
    console.log(`✅ ${data.length} comandos desplegados.`);
  } catch (e) { console.error(e); }
})();
