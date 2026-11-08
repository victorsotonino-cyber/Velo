require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const registerEvents = require('./src/bot');
if (!process.env.DISCORD_TOKEN) {
  console.error('Falta DISCORD_TOKEN. Configúralo en el entorno del hosting.');
  process.exit(1);
}
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel, Partials.Message]
});
client.commands = new Collection();
registerEvents(client);
process.on('unhandledRejection', error => console.error('Unhandled rejection:', error));
process.on('uncaughtException', error => { console.error('Uncaught exception:', error); });
client.login(process.env.DISCORD_TOKEN);
