const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  Events,
  ActivityType
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const config = require("./config");

if (!config.token) {
  console.error("Falta DISCORD_TOKEN en .env");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

client.commands = new Collection();

require("./events/buttons")(client);

const commandsPath = path.join(__dirname, "commands");
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith(".js"))) {
  const command = require(path.join(commandsPath, file));
  client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, c => {
  console.log(`✅ ${c.user.tag} está online.`);

  c.user.setPresence({
    activities: [{
      name: "todos los chats 👀",
      type: ActivityType.Watching
    }],
    status: "online"
  });
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction, client);
    } catch (error) {
      console.error(error);
      const message = {
        content: "❌ Ocurrió un error ejecutando este comando.",
        ephemeral: true
      };
      if (interaction.replied || interaction.deferred)
        await interaction.followUp(message);
      else
        await interaction.reply(message);
    }
  }
});

client.on(Events.GuildMemberAdd, async member => {
  const channel = member.guild.channels.cache.get(config.channels.welcome);
  if (!channel) return;

  await channel.send({
    content: `👋 ¡Bienvenido/a ${member} a **Velo Studio**!`
  }).catch(() => {});
});

client.on(Events.GuildMemberRemove, async member => {
  const channel = member.guild.channels.cache.get(config.channels.welcome);
  if (!channel) return;

  await channel.send({
    content: `👋 **${member.user?.tag || "Un miembro"}** ha salido de Velo Studio.`
  }).catch(() => {});
});

client.login(config.token);
