const { Client, GatewayIntentBits, Partials, Collection, Events, ActivityType, REST, Routes, PermissionFlagsBits, EmbedBuilder, ChannelType, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const config = require("./config");
const { emoji } = require("./ui");
const { readJSON, writeJSON } = require("./storage");
const giveawayService = require("./giveaway-service");

if (!config.token) {
  console.error("Falta DISCORD_TOKEN en Railway.");
  process.exit(1);
}

const PREFIX = process.env.BOT_PREFIX || "!";
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
const afkUsers = new Map();
const messageCounts = new Map();
client.afkUsers = afkUsers;
client.messageCounts = messageCounts;

for (const file of fs.readdirSync(__dirname).filter(f =>
  f.endsWith(".js") && !["index.js","config.js","deploy-commands.js","buttons.js"].includes(f)
)) {
  try {
    const command = require(path.join(__dirname, file));
    if (command.data && command.execute) {
      const name = command.data.name;
      if (client.commands.has(name)) {
        console.error("Comando duplicado ignorado:", name, "en", file, "(ya existe uno registrado)");
        continue;
      }
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
    activities: [{ name: "Flux STORE • /help | !help", type: ActivityType.Watching }],
    status: "online"
  });
  try { giveawayService.restore(c); }
  catch (e) { console.error("Error restaurando sorteos:", e); }
  try { await registerCommands(); }
  catch (e) { console.error("Error registrando comandos:", e); }
});

// Comandos slash.
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) {
    return interaction.reply({
      content: emoji(interaction.guild, "error", "❌") + " Ese comando ya no está disponible. Reinicia el registro de comandos.",
      ephemeral: true
    }).catch(() => {});
  }
  try { await command.execute(interaction, client); }
  catch (e) {
    console.error("Error en /" + interaction.commandName + ":", e);
    const msg = { content: emoji(interaction.guild, "error", "❌") + " Error en /" + interaction.commandName + ". Revisa los permisos del bot y vuelve a intentarlo.", ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
    else await interaction.reply(msg).catch(() => {});
  }
});

// Comandos con prefijo ! — se ejecutan como acciones reales, no como alias vacíos.
client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;

  const guildKey = message.guild.id;
  const userKey = message.author.id;
  const countKey = guildKey + ":" + userKey;
  messageCounts.set(countKey, (messageCounts.get(countKey) || 0) + 1);

  // AFK global: notifica menciones y quita el estado cuando la persona vuelve a escribir.
  const afk = afkUsers.get(userKey);
  if (afk && !message.content.startsWith(PREFIX + "afk")) {
    afkUsers.delete(userKey);
    await message.reply(emoji(message.guild, "success", "✅") + " Ya no estás AFK.").catch(() => {});
  }
  for (const user of message.mentions.users.values()) {
    if (user.bot || user.id === userKey) continue;
    const status = afkUsers.get(user.id);
    if (status) await message.reply(emoji(message.guild, "info", "💤") + " **" + user.tag + "** está AFK: " + status.message).catch(() => {});
  }

  if (!message.content.startsWith(PREFIX)) return;
  const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
  const command = (args.shift() || "").toLowerCase();
  if (!command) return;

  const fail = text => message.reply(emoji(message.guild, "error", "❌") + " " + text).catch(() => {});
  const ok = text => message.reply(emoji(message.guild, "success", "✅") + " " + text).catch(() => {});
  const member = message.mentions.members.first();
  const botMember = message.guild.members.me;
  const can = permission => message.member.permissions.has(permission);
  const need = permission => {
    if (!can(permission)) { fail("No tienes permiso para usar este comando."); return false; }
    return true;
  };

  try {
    switch (command) {
      case "giveaway": return giveawayService.executePrefix(message, args, client);
      case "help":
      case "ayuda": {
        const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle("Velo Studio • Comandos")
          .setDescription([
            "**Utilidad**",
            "`!help` `!ping` `!avatar [@usuario]` `!serverinfo` `!afk [mensaje]` `!messagecount [@usuario]`",
            "**Moderación**",
            "`!ban @usuario [razón]` `!kick @usuario [razón]` `!timeout @usuario minutos [razón]`",
            "`!untimeout @usuario` `!warn @usuario [razón]` `!clear cantidad` `!lock` `!unlock` `!slowmode segundos`",
            "**Tickets, mensajes y sorteos**",
            "`!ticket-panel` `!say texto`",
            "`!giveaway start [#canal] 1h 1 Premio | descripción`",
            "`!giveaway end ID` `!giveaway cancel ID` `!giveaway reroll ID` `!giveaway list`",
            "**También disponible con /**",
            [...client.commands.keys()].map(n => "`/" + n + "`").join(" ")
          ].join("\n")).setFooter({ text: "Prefijo actual: " + PREFIX });
        return message.reply({ embeds: [embed] });
      }
      case "ping":
        return ok("Pong • " + (Date.now() - message.createdTimestamp) + " ms | API " + client.ws.ping + " ms");
      case "afk": {
        const reason = args.join(" ").slice(0, 180) || "AFK";
        afkUsers.set(userKey, { message: reason, since: Date.now() });
        return ok("Ahora estás AFK: " + reason);
      }
      case "messagecount":
      case "messages": {
        const target = message.mentions.users.first() || message.author;
        const count = messageCounts.get(guildKey + ":" + target.id) || 0;
        return ok(target.tag + " ha enviado " + count + " mensajes desde el último reinicio del bot.");
      }
      case "avatar": {
        const target = message.mentions.users.first() || message.author;
        const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle("Avatar de " + target.username)
          .setImage(target.displayAvatarURL({ size: 1024, extension: "png" }));
        return message.reply({ embeds: [embed] });
      }
      case "serverinfo": {
        const g = message.guild;
        const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle("Información • " + g.name)
          .setThumbnail(g.iconURL({ size: 512 }))
          .addFields(
            { name: "Miembros", value: String(g.memberCount), inline: true },
            { name: "Canales", value: String(g.channels.cache.size), inline: true },
            { name: "Roles", value: String(g.roles.cache.size), inline: true },
            { name: "Creado", value: "<t:" + Math.floor(g.createdTimestamp / 1000) + ":D>", inline: true }
          );
        return message.reply({ embeds: [embed] });
      }
      case "say": {
        if (!need(PermissionFlagsBits.ManageMessages)) return;
        const text = args.join(" ").trim();
        if (!text) return fail("Uso: `!say texto`");
        await message.delete().catch(() => {});
        return message.channel.send({ content: text, allowedMentions: { parse: [] } });
      }
      case "clear":
      case "purge": {
        if (!need(PermissionFlagsBits.ManageMessages)) return;
        const amount = Number(args[0]);
        if (!Number.isInteger(amount) || amount < 1 || amount > 100) return fail("Uso: `!clear 1-100`");
        const deleted = await message.channel.bulkDelete(amount, true);
        return message.channel.send(emoji(message.guild, "success", "✅") + " Eliminados **" + deleted.size + "** mensajes.").then(m => setTimeout(() => m.delete().catch(() => {}), 5000));
      }
      case "ban": {
        if (!need(PermissionFlagsBits.BanMembers)) return;
        if (!member) return fail("Uso: `!ban @usuario [razón]`");
        if (!member.bannable) return fail("No puedo banear a ese usuario. Revisa la jerarquía de roles.");
        await member.ban({ reason: args.slice(1).join(" ") || "Sin razón indicada" });
        return ok("Usuario baneado: " + member.user.tag);
      }
      case "kick": {
        if (!need(PermissionFlagsBits.KickMembers)) return;
        if (!member) return fail("Uso: `!kick @usuario [razón]`");
        if (!member.kickable) return fail("No puedo expulsar a ese usuario. Revisa la jerarquía de roles.");
        await member.kick(args.slice(1).join(" ") || "Sin razón indicada");
        return ok("Usuario expulsado: " + member.user.tag);
      }
      case "timeout": {
        if (!need(PermissionFlagsBits.ModerateMembers)) return;
        if (!member) return fail("Uso: `!timeout @usuario minutos [razón]`");
        const minutes = Number(args[1]);
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 40320) return fail("Indica minutos entre 1 y 40320.");
        if (!member.moderatable) return fail("No puedo aplicar timeout a ese usuario.");
        await member.timeout(minutes * 60000, args.slice(2).join(" ") || "Sin razón indicada");
        return ok("Timeout aplicado a " + member.user.tag + " por " + minutes + " minutos.");
      }
      case "untimeout": {
        if (!need(PermissionFlagsBits.ModerateMembers)) return;
        if (!member) return fail("Uso: `!untimeout @usuario`");
        if (!member.moderatable) return fail("No puedo quitar el timeout a ese usuario.");
        await member.timeout(null);
        return ok("Timeout quitado a " + member.user.tag + ".");
      }
      case "warn": {
        if (!need(PermissionFlagsBits.ModerateMembers)) return;
        if (!member) return fail("Uso: `!warn @usuario [razón]`");
        const reason = args.slice(1).join(" ") || "Sin razón indicada";
        const log = message.guild.channels.cache.get(config.channels.logs);
        if (log?.isTextBased()) await log.send("⚠️ " + member.user + " recibió una advertencia de " + message.author + ". Razón: " + reason).catch(() => {});
        return ok(member.user.tag + " recibió una advertencia. Razón: " + reason);
      }
      case "lock": {
        if (!need(PermissionFlagsBits.ManageChannels)) return;
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
        return ok("Canal bloqueado.");
      }
      case "unlock": {
        if (!need(PermissionFlagsBits.ManageChannels)) return;
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
        return ok("Canal desbloqueado.");
      }
      case "slowmode": {
        if (!need(PermissionFlagsBits.ManageChannels)) return;
        const seconds = Number(args[0]);
        if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) return fail("Uso: `!slowmode 0-21600` segundos.");
        await message.channel.setRateLimitPerUser(seconds);
        return ok("Modo lento configurado a " + seconds + " segundos.");
      }
      case "ticket-panel": {
        if (!need(PermissionFlagsBits.ManageChannels)) return;
        const categories = Object.entries(config.ticket.categories || {});
        if (!categories.length) return fail("No hay categorías de tickets configuradas.");
        const options = categories.map(([value, c]) => {
          const option = { label: String(c.label || value).slice(0, 100), value, description: String(c.description || "Abre un ticket.").slice(0, 100) };
          const custom = c.emojiId ? message.guild.emojis.cache.get(c.emojiId) : null;
          if (custom) option.emoji = { id: custom.id, name: custom.name, animated: custom.animated };
          return option;
        });
        const menu = new StringSelectMenuBuilder().setCustomId("ticket_create").setPlaceholder("🎫 Selecciona una categoría").setMinValues(1).setMaxValues(1).addOptions(options);
        const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle("🎫 Velo Studio | Centro de soporte")
          .setDescription("¿Necesitas ayuda? Selecciona la categoría que mejor describa tu consulta.\n\n" + categories.map(([type, c]) => {
            const custom = c.emojiId ? message.guild.emojis.cache.get(c.emojiId) : null;
            return (custom ? custom.toString() + " " : "🎫 ") + "**" + c.label + "** — " + c.description;
          }).join("\n"))
          .setFooter({ text: "Velo Studio • Atención y soporte" });
        return message.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
      }
      default:
        return fail("No conozco ese comando. Usa `!help` para ver los comandos.");
    }
  } catch (e) {
    console.error("Error en !" + command + ":", e);
    return fail("El comando falló. Comprueba los permisos del bot y vuelve a intentarlo.");
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
