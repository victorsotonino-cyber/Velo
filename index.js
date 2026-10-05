require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember]
});

client.commands = new Collection();

function loadCommands(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) loadCommands(full);
    else if (item.name.endsWith('.js')) {
      const cmd = require(full);
      if (cmd.data && cmd.execute) client.commands.set(cmd.data.name, cmd);
    }
  }
}
loadCommands(path.join(__dirname, 'commands'));

for (const file of fs.readdirSync(path.join(__dirname, 'events')).filter(f => f.endsWith('.js'))) {
  const evt = require(path.join(__dirname, 'events', file));
  if (evt.once) client.once(evt.name, (...a) => evt.execute(client, ...a));
  else client.on(evt.name, (...a) => evt.execute(client, ...a));
}

process.on('unhandledRejection', (e) => console.error('[Unhandled]', e));

client.login(process.env.DISCORD_TOKEN);
