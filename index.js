require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const registerEvents = require('./src/events');
if (!process.env.DISCORD_TOKEN) { console.error('Falta DISCORD_TOKEN.'); process.exit(1); }
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildModeration], partials: [Partials.Channel, Partials.Message, Partials.GuildMember] });
registerEvents(client);
client.login(process.env.DISCORD_TOKEN).catch((e) => { console.error('Error de inicio:', e.message); process.exitCode = 1; });
for (const signal of ['SIGINT','SIGTERM']) process.once(signal, () => { client.destroy(); require('./src/database').close(); process.exit(0); });
