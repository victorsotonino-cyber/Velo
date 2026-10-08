const { Client, GatewayIntentBits, Partials, Collection, Events, ActivityType, REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");
const config = require("./config");
const { emoji } = require("./ui");

if (!config.token) {
  console.error("Falta DISCORD_TOKEN en Railway.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

client.commands = new Collection();

for (const file of fs.readdirSync(__dirname).filter(f =>
  f.endsWith(".js") && !["index.js","config.js","deploy-commands.js","buttons.js"].includes(f)
)) {
  try {
    const command = require(path.join(__dirname, file));
    if (command.data && command.execute) {
      const name = command.data.name;
      if (client.commands.has(name)) console.warn("Comando duplicado:", name, "en", file);
      client.commands.set(name, command);
    }
  } catch (e) {
    console.error("Error cargando " + file + ":", e);
  }
}

require("./buttons")(client);

async function registerCommands() {
  if (!config.clientId || !config.guildId) {
    console.warn("CLIENT_ID/GUILD_ID no configurados; no se registrarán comandos.");
    return;
  }
  const body = [...client.commands.values()].map(c => c.data.toJSON());
  const rest = new REST({ version: "10" }).setToken(config.token);
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
  console.log("Comandos slash registrados:", body.length);
}

client.once(Events.ClientReady, async c => {
  console.log(c.user.tag + " está online.");
  c.user.setPresence({
    activities: [{ name: "Velo Studio • /help", type: ActivityType.Watching }],
    status: "online"
  });
  try {
    await registerCommands();
  } catch (e) {
    console.error("Error registrando comandos:", e);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) {
    return interaction.reply({
      content: emoji(interaction.guild, "error", "❌") + " Ese comando ya no está disponible. Reinicia el registro de comandos.",
      ephemeral: true
    }).catch(() => {});
  }

  try {
    await command.execute(interaction, client);
  } catch (e) {
    console.error("Error en /" + interaction.commandName + ":", e);
    const msg = { content: emoji(interaction.guild, "error", "❌") + " Ocurrió un error ejecutando este comando. Revisa los permisos y la configuración.", ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
    else await interaction.reply(msg).catch(() => {});
  }
});

client.on(Events.GuildMemberAdd, async member => {
  const ch = member.guild.channels.cache.get(config.channels.welcome);
  if (ch?.isTextBased()) await ch.send(emoji(member.guild, "success", "👋") + " ¡Bienvenido/a " + member + " a **Velo Studio**!").catch(() => {});
});

client.on(Events.GuildMemberRemove, async member => {
  const ch = member.guild.channels.cache.get(config.channels.welcome);
  if (ch?.isTextBased()) await ch.send(emoji(member.guild, "info", "👋") + " **" + (member.user?.tag || "Un miembro") + "** ha salido de Velo Studio.").catch(() => {});
});

process.on("unhandledRejection", error => console.error("Unhandled rejection:", error));
process.on("uncaughtException", error => console.error("Uncaught exception:", error));

async function shutdown(signal) {
  console.log("Cerrando Velo por " + signal + "...");
  try { client.destroy(); } finally { process.exit(0); }
}
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

client.login(config.token).catch(error => {
  console.error("No se pudo iniciar sesión en Discord:", error?.message || error);
  process.exit(1);
});
