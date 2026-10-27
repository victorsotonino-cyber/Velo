const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { Client, Collection, GatewayIntentBits, Partials, Events, ActivityType } = require("discord.js");
const config = require("./config");

if (!config.token) {
  console.error("[DATASHOP] Falta DISCORD_TOKEN en las variables de entorno.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel, Partials.Message]
});
client.commands = new Collection();

const commandsPath = path.join(__dirname, "src", "commands");
if (fs.existsSync(commandsPath)) {
  for (const file of fs.readdirSync(commandsPath).filter(name => name.endsWith(".js"))) {
    const command = require(path.join(commandsPath, file));
    if (!command.data?.name || typeof command.execute !== "function") {
      console.warn(`[DATASHOP] Se omitió un comando inválido: ${file}`);
      continue;
    }
    if (client.commands.has(command.data.name)) {
      console.warn(`[DATASHOP] Comando duplicado omitido: ${command.data.name}`);
      continue;
    }
    client.commands.set(command.data.name, command);
  }
}

client.once(Events.ClientReady, readyClient => {
  readyClient.user.setPresence({ activities: [{ name: "DATASHOP | !help", type: ActivityType.Watching }], status: "online" });
  console.log(`[DATASHOP] Conectado como ${readyClient.user.tag}. Comandos cargados: ${client.commands.size}`);
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) {
    await interaction.reply({ content: "Este comando no está disponible.", ephemeral: true }).catch(() => {});
    return;
  }
  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error(`[DATASHOP] Error en /${interaction.commandName}:`, error);
    const reply = { content: "Ocurrió un error al ejecutar el comando. Inténtalo de nuevo más tarde.", ephemeral: true };
    if (interaction.deferred || interaction.replied) await interaction.followUp(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
  }
});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !message.guild || !message.content.startsWith(config.prefix)) return;
  const [name, ...args] = message.content.slice(config.prefix.length).trim().split(/\s+/);
  if (!name) return;
  if (name.toLowerCase() === "ping") return message.reply(`🏓 Pong: ${client.ws.ping} ms`);
  if (name.toLowerCase() === "help") return message.reply("**DATASHOP — Ayuda**\nComandos: `/ping`, `/help`, `!ping`, `!help`");
});

const server = http.createServer((req, res) => {
  const healthy = req.url === "/health" && client.isReady();
  res.writeHead(healthy ? 200 : 200, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify({ service: "DATASHOP", status: client.isReady() ? "online" : "starting" }));
});
server.listen(config.port, "0.0.0.0", () => console.log(`[DATASHOP] Health server en puerto ${config.port}`));

process.on("unhandledRejection", error => console.error("[DATASHOP] Promesa rechazada:", error));
process.on("uncaughtException", error => {
  console.error("[DATASHOP] Excepción no capturada:", error);
  process.exit(1);
});

client.login(config.token).catch(error => {
  console.error("[DATASHOP] No se pudo iniciar sesión. Revisa DISCORD_TOKEN:", error.message);
  process.exit(1);
});
