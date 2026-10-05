const { Client, GatewayIntentBits, Partials, Collection, Events, ActivityType, REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");
const config = require("./config");

if (!config.token) { console.error("Falta DISCORD_TOKEN en Railway."); process.exit(1); }

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
    if (command.data && command.execute) client.commands.set(command.data.name, command);
  } catch (e) {
    console.error("Error cargando " + file, e.message);
  }
}

require("./buttons")(client);

client.once(Events.ClientReady, async c => {
  console.log(c.user.tag + " está online.");
  c.user.setPresence({ activities: [{ name: "todos los chats 👀", type: ActivityType.Watching }], status: "online" });

  if (config.clientId && config.guildId) {
    try {
      const rest = new REST({ version: "10" }).setToken(config.token);
      await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: [...client.commands.values()].map(x => x.data.toJSON()) }
      );
      console.log("Comandos slash registrados.");
    } catch (e) {
      console.error("Error registrando comandos:", e.message);
    }
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, client);
  } catch (e) {
    console.error(e);
    const msg = { content: "❌ Ocurrió un error ejecutando este comando.", ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
    else await interaction.reply(msg).catch(() => {});
  }
});

client.on(Events.GuildMemberAdd, async member => {
  const ch = member.guild.channels.cache.get(config.channels.welcome);
  if (ch) await ch.send("👋 ¡Bienvenido/a " + member + " a **Velo Studio**!").catch(() => {});
});

client.on(Events.GuildMemberRemove, async member => {
  const ch = member.guild.channels.cache.get(config.channels.welcome);
  if (ch) await ch.send("👋 **" + (member.user?.tag || "Un miembro") + "** ha salido de Velo Studio.").catch(() => {});
});

client.login(config.token);