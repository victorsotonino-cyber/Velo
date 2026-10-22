const { Client, GatewayIntentBits, Partials, Collection, Events, ActivityType, REST, Routes, PermissionFlagsBits, EmbedBuilder, ChannelType, ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");
const config = require("./config");
const { emoji, emojiData } = require("./ui");
const { readJSON, writeJSON } = require("./storage");
const giveawayService = require("./giveaway-service");
const storeService = require("./store-service");

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

  // Vouches de tienda: +vouch @cliente Producto | Pago y precio
  if (/^\+vouch(?:\s|$)/i.test(message.content)) {
    if (!storeService.isStoreStaff(message.member)) {
      return message.reply("❌ Solo el equipo autorizado puede registrar ventas.").catch(() => {});
    }
    const buyer = message.mentions.members.first();
    if (!buyer) return message.reply("Uso: +vouch @cliente Producto | Método de pago [precio]").catch(() => {});
    const details = message.content.replace(/^\+vouch\s*/i, "").replace(/<@!?\d+>/, "").trim();
    if (!details) return message.reply("Indica el producto y el método de pago. Ejemplo: +vouch @cliente Nitro 1 mes | PayPal [7€]").catch(() => {});
    const stats = await storeService.addVouch(message.guild, {
      buyerId: buyer.id,
      buyerTag: buyer.user.tag,
      details,
      registeredById: message.author.id,
      registeredByTag: message.author.tag
    });
    const embed = new EmbedBuilder()
      .setColor(config.colors.success)
      .setTitle("⚡ ᴠᴏᴜᴄʜ ʀᴇɢɪsᴛʀᴀᴅᴏ")
      .setDescription("**Cliente:** " + buyer + "\n**Compra:** " + details.slice(0, 900) + "\n**Registrado por:** " + message.author)
      .setFooter({ text: "Flux STORE • Venta #" + stats.sales })
      .setTimestamp();
    await message.channel.send({ embeds: [embed] });
    return message.channel.send("⚡ Vouch registrado con éxito, **Flux STORE ahora tiene #" + stats.sales + " ventas**.");
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
        const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle("Flux Store • Comandos")
          .setDescription([
            "**Utilidad**",
            "`!help` `!comandos` `!ping` `!avatar [@usuario]` `!userinfo [@usuario]` `!roleinfo @rol` `!poll pregunta | opción 1 | opción 2`",
            "`!serverinfo` `!afk [mensaje]` `!messagecount [@usuario]` `!tienda catalogo` `!ventas ver`",
            "**Moderación**",
            "`!ban @usuario [razón]` `!unban ID [razón]` `!kick @usuario [razón]` `!timeout @usuario minutos [razón]`",
            "`!untimeout @usuario` `!warn @usuario [razón]` `!clear cantidad` `!lock` `!unlock` `!slowmode segundos`",
            "**Tickets, mensajes y sorteos**",
            "`!ticket-panel` `!setup-plantilla` `!setup-sorteos` `!crear-roles-tienda` `!say texto`",
            "`!giveaway start [#canal] 1h 1 Premio | descripción`",
            "`!giveaway end ID` `!giveaway cancel ID` `!giveaway reroll ID` `!giveaway list`",
            "**También disponible con /**",
            [...client.commands.keys()].map(n => "`/" + n + "`").join(" ")
          ].join("\n")).setFooter({ text: "Prefijo actual: " + PREFIX });
        return message.reply({ embeds: [embed] });
      }
      case "ping":
        return ok("Pong • " + (Date.now() - message.createdTimestamp) + " ms | API " + client.ws.ping + " ms");
      case "comandos": {
        const names = [...client.commands.keys()].sort((a, b) => a.localeCompare(b, "es"));
        const embed = new EmbedBuilder()
          .setColor(config.colors.primary || 0x8B5CF6)
          .setTitle("Flux STORE • Centro de comandos")
          .setDescription(names.map(n => "`/" + n + "`").join(" · ").slice(0, 4000))
          .addFields({ name: "Comandos con prefijo", value: "`!help` `!ping` `!userinfo` `!roleinfo` `!poll` `!unban` `!ban` `!kick` `!timeout` `!clear` `!lock` `!unlock` `!slowmode`" })
          .setFooter({ text: "Comandos cargados: " + names.length + " • Prefijo: " + PREFIX });
        return message.reply({ embeds: [embed] });
      }
      case "unban": {
        if (!need(PermissionFlagsBits.BanMembers)) return;
        const targetId = (args[0] || "").replace(/\D/g, "");
        if (!/^\d{17,20}$/.test(targetId)) return fail("Uso: `!unban ID [razón]`. Copia el ID del usuario baneado.");
        const reason = args.slice(1).join(" ") || "Baneo retirado por " + message.author.tag;
        await message.guild.bans.remove(targetId, reason);
        return ok("Baneo retirado para el usuario ID `" + targetId + "`.");
      }
      case "userinfo":
      case "whois": {
        const target = message.mentions.users.first() || message.author;
        const targetMember = await message.guild.members.fetch(target.id).catch(() => null);
        const roles = targetMember
          ? targetMember.roles.cache.filter(r => r.id !== message.guild.id).sort((a, b) => b.position - a.position).map(r => r.toString()).slice(0, 10).join(" ")
          : "No es miembro de este servidor.";
        const embed = new EmbedBuilder()
          .setColor(config.colors.primary || 0x8B5CF6)
          .setTitle("Información de usuario • " + target.tag)
          .setThumbnail(target.displayAvatarURL({ size: 512 }))
          .addFields(
            { name: "ID", value: target.id, inline: true },
            { name: "Bot", value: target.bot ? "Sí" : "No", inline: true },
            { name: "Cuenta creada", value: "<t:" + Math.floor(target.createdTimestamp / 1000) + ":F>", inline: false },
            { name: "Se unió al servidor", value: targetMember?.joinedTimestamp ? "<t:" + Math.floor(targetMember.joinedTimestamp / 1000) + ":F>" : "No disponible", inline: false },
            { name: "Roles", value: (roles || "Sin roles adicionales").slice(0, 1024), inline: false }
          )
          .setFooter({ text: "Flux STORE • User Info" });
        return message.reply({ embeds: [embed] });
      }
      case "roleinfo": {
        const roleId = (args[0] || "").replace(/\D/g, "");
        const role = message.mentions.roles.first() || (roleId ? message.guild.roles.cache.get(roleId) || await message.guild.roles.fetch(roleId).catch(() => null) : null);
        if (!role) return fail("Uso: `!roleinfo @rol` o `!roleinfo ID`.");
        const permissions = role.permissions.toArray().slice(0, 12).map(p => "`" + p + "`").join(", ") || "Ningún permiso especial";
        const embed = new EmbedBuilder()
          .setColor(role.color || config.colors.primary || 0x8B5CF6)
          .setTitle("Información del rol • " + role.name)
          .addFields(
            { name: "ID", value: role.id, inline: true },
            { name: "Miembros en caché", value: String(role.members.size), inline: true },
            { name: "Posición", value: String(role.position), inline: true },
            { name: "Creado", value: "<t:" + Math.floor(role.createdTimestamp / 1000) + ":F>", inline: false },
            { name: "Permisos principales", value: permissions.slice(0, 1024), inline: false },
            { name: "Mencionable", value: role.mentionable ? "Sí" : "No", inline: true },
            { name: "Gestionado por integración", value: role.managed ? "Sí" : "No", inline: true }
          )
          .setFooter({ text: "Flux STORE • Role Info" });
        return message.reply({ embeds: [embed] });
      }
      case "poll": {
        const raw = message.content.slice(PREFIX.length + command.length).trim();
        const parts = raw.split("|").map(x => x.trim()).filter(Boolean);
        const question = parts.shift();
        if (!question || parts.length < 2 || parts.length > 10) return fail("Uso: `!poll pregunta | opción 1 | opción 2` (de 2 a 10 opciones).");
        if (parts.some(x => x.length > 80)) return fail("Cada opción debe tener 80 caracteres o menos.");
        const reactions = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
        const embed = new EmbedBuilder()
          .setColor(config.colors.primary || 0x8B5CF6)
          .setTitle("📊 " + question.slice(0, 240))
          .setDescription(parts.map((x, n) => reactions[n] + " **" + x + "**").join("\n"))
          .setFooter({ text: "Flux STORE • Vota con una reacción" })
          .setTimestamp();
        const pollMessage = await message.channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
        for (let n = 0; n < parts.length; n++) await pollMessage.react(reactions[n]).catch(() => {});
        return;
      }
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
      case "crear-roles-tienda": {
        if (!need(PermissionFlagsBits.ManageRoles)) return;
        if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) return fail("Necesito el permiso Gestionar roles para crear los rangos.");
        const definitions = [
          { name: "✦ ᴏᴡɴᴇʀ", color: 0xE74C3C, permissions: [PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ViewAuditLog] },
          { name: "✦ ᴍᴀɴᴀɢᴇʀ", color: 0xE67E22, permissions: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageThreads, PermissionFlagsBits.ViewAuditLog] },
          { name: "✦ ᴀᴅᴍɪɴ", color: 0xC0392B, permissions: [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers, PermissionFlagsBits.BanMembers, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ViewAuditLog] },
          { name: "✦ ʜᴇᴀᴅ sᴛᴀғғ", color: 0x9B59B6, permissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ViewAuditLog] },
          { name: "✦ sᴜᴘᴘᴏʀᴛ", color: 0x3498DB, permissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ModerateMembers] },
          { name: "✦ ᴍᴏᴅᴇʀᴀᴛᴏʀ", color: 0x2ECC71, permissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.KickMembers] },
          { name: "✦ ᴍᴇᴅɪᴀ", color: 0x1ABC9C, permissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.AttachFiles] },
          { name: "✦ ᴘᴀʀᴛɴᴇʀ", color: 0xF1C40F, permissions: [] },
          { name: "✦ ʙᴏᴏsᴛᴇʀ", color: 0xE84393, permissions: [] },
          { name: "✦ ᴄʟɪᴇɴᴛᴇ", color: 0x16A085, permissions: [] },
          { name: "✦ ᴍɪᴇᴍʙʀᴏ", color: 0x95A5A6, permissions: [] }
        ];
        const created = [];
        const existing = [];
        for (const def of definitions) {
          let role = message.guild.roles.cache.find(r => r.name === def.name);
          if (role) { existing.push(role.name); continue; }
          role = await message.guild.roles.create({
            name: def.name,
            color: def.color,
            permissions: def.permissions,
            hoist: ["✦ ᴏᴡɴᴇʀ", "✦ ᴍᴀɴᴀɢᴇʀ", "✦ ᴀᴅᴍɪɴ", "✦ ʜᴇᴀᴅ sᴛᴀғғ", "✦ sᴜᴘᴘᴏʀᴛ", "✦ ᴍᴏᴅᴇʀᴀᴛᴏʀ"].includes(def.name),
            mentionable: false,
            reason: "Crear rangos originales de Flux STORE"
          });
          created.push(role.name);
        }
        const embed = new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle("✦ ʀᴀɴɢᴏs ᴅᴇ ғʟᴜx sᴛᴏʀᴇ ✦")
          .setDescription(created.length ? created.map(n => "・" + n).join("\n") : "Todos los rangos ya existían.")
          .addFields({ name: "Permisos", value: "Los rangos de gestión tienen permisos específicos; el rango Owner no recibe Administrador total. Revisa y asigna los roles manualmente a las personas correctas." })
          .setFooter({ text: "Flux STORE • Sistema de rangos" });
        if (existing.length) embed.addFields({ name: "Ya existían", value: existing.join(", ").slice(0, 1024) });
        return message.reply({ embeds: [embed] });
      }
      case "setup-plantilla": {
        if (!need(PermissionFlagsBits.ManageChannels)) return;
        const everyone = message.guild.roles.everyone;
        const staffRole = message.guild.roles.cache.get(config.roles.staff);
        const adminRole = message.guild.roles.cache.get(config.roles.admin);
        const staffRoles = [staffRole, adminRole].filter(Boolean);
        const publicView = { ViewChannel: true, ReadMessageHistory: true };
        const makeCategory = async (name, staffOnly = false) => {
          let cat = message.guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === name);
          const overwrites = staffOnly
            ? [
                { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                ...staffRoles.map(role => ({ id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] }))
              ]
            : [{ id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] }];
          if (!cat) cat = await message.guild.channels.create({ name, type: ChannelType.GuildCategory, permissionOverwrites: overwrites, reason: "Plantilla renovada de Flux STORE" });
          else await cat.permissionOverwrites.set(overwrites).catch(() => {});
          return cat;
        };
        const makeText = async (category, name, options = {}) => {
          let ch = message.guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === name && c.parentId === category.id);
          const staffOnly = Boolean(options.staffOnly);
          const overwrites = staffOnly
            ? [
                { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                ...staffRoles.map(role => ({ id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] }))
              ]
            : [
                { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, ...(options.readOnly ? [] : [PermissionFlagsBits.SendMessages])], ...(options.readOnly ? {} : {}) },
                ...staffRoles.map(role => ({ id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }))
              ];
          if (options.readOnly) overwrites[0].deny = [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions];
          if (!ch) ch = await message.guild.channels.create({ name, type: ChannelType.GuildText, parent: category.id, permissionOverwrites: overwrites, topic: options.topic || "Canal oficial de Flux STORE." });
          else {
            await ch.permissionOverwrites.set(overwrites).catch(() => {});
            if (ch.parentId !== category.id) await ch.setParent(category.id).catch(() => {});
          }
          return ch;
        };
        const plans = [
          { name: "📌・INICIO", channels: [["👋・bienvenida"], ["📢・anuncios", {readOnly:true}], ["📜・normas", {readOnly:true}], ["🧾・terminos", {readOnly:true}]] },
          { name: "📊・ESTADÍSTICAS", channels: [["🛒・ventas: 8", {voice:true, counter:"sales"}], ["✅・legit: 12", {voice:true, counter:"legit"}], ["👥・miembros: 0", {voice:true, counter:"members"}], ["🤖・bots: 0", {voice:true, counter:"bots"}]] },
          { name: "🛍️・FLUX STORE", channels: [["🛒・catalogo"], ["💳・metodos-de-pago", {readOnly:true}], ["🆕・novedades", {readOnly:true}], ["❓・preguntas-frecuentes", {readOnly:true}]] },
          { name: "💬・COMUNIDAD", channels: [["💭・chat"], ["🤖・comandos"], ["📸・media"], ["🔊・general-voice", {voice:true}]] },
          { name: "🌟・REPUTACIÓN", channels: [["💬・vouches"], ["⭐・reviews"], ["✅・legit-check"]] },
          { name: "🎉・SORTEOS", channels: [["🎁・giveaways", {readOnly:true}], ["🏆・ganadores", {readOnly:true}]] },
          { name: "🎫・ATENCIÓN", channels: [["🎟️・tickets", {readOnly:true}]] },
          { name: "🛡️・ZONA STAFF", staffOnly:true, channels: [["🔒・staff-chat", {staffOnly:true}], ["📋・staff-anuncios", {staffOnly:true}], ["🧾・logs-staff", {staffOnly:true}], ["🚨・reportes-staff", {staffOnly:true}]] }
        ];
        let created = 0;
        for (const plan of plans) {
          const cat = await makeCategory(plan.name, Boolean(plan.staffOnly));
          for (const [name, opts = {}] of plan.channels) {
            if (opts.voice) {
              const counterStats = storeService.getStats();
              const counterNames = { sales: "🛒・ventas: " + counterStats.sales, legit: "✅・legit: " + counterStats.legit, members: "👥・miembros: " + message.guild.memberCount, bots: "🤖・bots: " + message.guild.members.cache.filter(m => m.user.bot).size };
              const counterPrefixes = { sales: "🛒・ventas:", legit: "✅・legit:", members: "👥・miembros:", bots: "🤖・bots:" };
              const voiceName = opts.counter ? counterNames[opts.counter] : name;
              let ch = message.guild.channels.cache.find(c => c.type === ChannelType.GuildVoice && (opts.counter ? c.name.startsWith(counterPrefixes[opts.counter]) : c.name === name) && c.parentId === cat.id);
              if (!ch) {
                ch = await message.guild.channels.create({
                  name: voiceName, type: ChannelType.GuildVoice, parent: cat.id,
                  permissionOverwrites: [{ id: everyone.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.Connect] }]
                });
                created++;
              } else if (ch.name !== voiceName) {
                await ch.setName(voiceName).catch(() => {});
              }
            } else {
              const before = message.guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === name && c.parentId === cat.id);
              await makeText(cat, name, { ...opts, staffOnly: Boolean(plan.staffOnly || opts.staffOnly) });
              if (!before) created++;
            }
          }
        }
        await storeService.refreshCounters(message.guild);
        return ok("Plantilla Flux STORE lista. Canales nuevos: **" + created + "**. La zona staff queda oculta para @everyone. " + (staffRoles.length ? "Permisos aplicados a los roles de staff/admin configurados." : "⚠️ No encontré los roles de staff/admin configurados: revisa STAFF_ROLE_ID y ADMIN_ROLE_ID en config.js."));
      }
      case "tienda": {
        const rawArgs = message.content.slice(PREFIX.length + command.length).trim();
        const action = (args.shift() || "catalogo").toLowerCase();
        const parts = rawArgs.slice(action === "catalogo" ? rawArgs.length : action.length).trim().split("|").map(s => s.trim());
        const products = storeService.getProducts();
        if (action === "catalogo" || action === "lista") {
          const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle("🛍️ ᴄᴀᴛáʟᴏɢᴏ ᴅᴇ ғʟᴜx sᴛᴏʀᴇ")
            .setDescription(products.length ? products.slice(0, 25).map(p => "✦ **" + p.name + "** — **" + p.price + "**\n" + (p.description || "Consulta por ticket para más información.")).join("\n\n") : "El catálogo está vacío.")
            .setFooter({ text: "Flux STORE • Catálogo editable" });
          return message.reply({ embeds: [embed] });
        }
        if (!storeService.isStoreStaff(message.member)) return fail("Solo el equipo autorizado puede modificar el catálogo.");
        if (action === "agregar") {
          if (parts.length < 2 || !parts[0] || !parts[1]) return fail("Uso: !tienda agregar Nombre | Precio | Descripción");
          if (products.some(p => p.name.toLowerCase() === parts[0].toLowerCase())) return fail("Ese producto ya existe; usa !tienda editar.");
          products.push({ name: parts[0].slice(0,80), price: parts[1].slice(0,40), description: (parts[2] || "").slice(0,500), updatedAt: new Date().toISOString() });
          storeService.saveProducts(products);
          return ok("Producto añadido al catálogo: " + parts[0] + ".");
        }
        if (action === "editar") {
          if (!parts[0] || (!parts[1] && parts.length < 3)) return fail("Uso: !tienda editar Nombre actual | Nuevo precio | Nueva descripción");
          const p = products.find(x => x.name.toLowerCase() === parts[0].toLowerCase());
          if (!p) return fail("No encontré ese producto.");
          if (parts[1]) p.price = parts[1].slice(0,40);
          if (parts.length >= 3) p.description = (parts[2] || "").slice(0,500);
          p.updatedAt = new Date().toISOString(); storeService.saveProducts(products);
          return ok("Producto actualizado: " + p.name + ".");
        }
        if (action === "eliminar") {
          const name = rawArgs.slice(action.length).trim();
          const index = products.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
          if (index < 0) return fail("No encontré ese producto. Uso: !tienda eliminar Nombre");
          const [removed] = products.splice(index, 1); storeService.saveProducts(products);
          return ok("Producto eliminado: " + removed.name + ".");
        }
        return fail("Usa !tienda catalogo, !tienda agregar Nombre | Precio | Descripción, !tienda editar Nombre | Precio | Descripción o !tienda eliminar Nombre.");
      }
      case "ventas": {
        const action = (args[0] || "ver").toLowerCase();
        if (action === "ver") {
          const stats = storeService.getStats();
          return ok("Flux STORE tiene **" + stats.sales + " ventas** y **" + stats.legit + " verificaciones legit**.");
        }
        if (!storeService.isStoreStaff(message.member)) return fail("Solo el equipo autorizado puede cambiar el contador.");
        let stats;
        if (action === "sumar") {
          const amount = args[1] == null ? 1 : Number(args[1]);
          if (!Number.isInteger(amount) || amount < 1 || amount > 10000) return fail("Uso: !ventas sumar [cantidad positiva]");
          stats = storeService.addSales(amount);
        } else if (action === "establecer") {
          const amount = Number(args[1]);
          if (!Number.isInteger(amount) || amount < 0 || amount > 100000000) return fail("Uso: !ventas establecer [total]");
          stats = storeService.setSales(amount);
        } else return fail("Usa !ventas ver, !ventas sumar [cantidad] o !ventas establecer [total].");
        await storeService.refreshCounters(message.guild);
        return ok("Contador actualizado: " + stats.sales + " ventas.");
      }
      case "legit": {
        const stats = storeService.getStats();
        const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle("✦ ᴇs ғʟᴜx sᴛᴏʀᴇ ʟᴇɢɪᴛ? ✦")
          .setDescription("Si tu experiencia con la tienda fue positiva, confirma abajo. Cada persona cuenta una sola vez.\n\n✅ **ᴘᴇʀsᴏɴᴀs ǫᴜᴇ ᴠᴇʀɪғɪᴄᴀʀᴏɴ ǫᴜᴇ sᴏᴍᴏs ʟᴇɢɪᴛ:** **" + stats.legit + "**")
          .setFooter({ text: "Flux STORE • Puedes actualizar tu respuesta" }).setTimestamp();
        const row = new ActionRowBuilder().addComponents(
          new (require("discord.js").ButtonBuilder)().setCustomId("flux_legit_yes").setLabel("Sí").setEmoji("✅").setStyle(require("discord.js").ButtonStyle.Success),
          new (require("discord.js").ButtonBuilder)().setCustomId("flux_legit_no").setLabel("No").setEmoji("❌").setStyle(require("discord.js").ButtonStyle.Danger)
        );
        return message.channel.send({ embeds: [embed], components: [row] });
      }
      case "setup-sorteos": {
        if (!need(PermissionFlagsBits.ManageChannels)) return;
        const categoryName = "🎉・SORTEOS";
        const channelName = "🎁・giveaways";
        let category = message.guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === categoryName);
        if (!category) category = await message.guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory, reason: "Crear categoría de sorteos para Flux STORE" });
        let channel = message.guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === channelName && c.parentId === category.id);
        if (!channel) channel = await message.guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: category.id,
          topic: "🎉 Sorteos oficiales de Flux STORE. Participa usando los botones de cada sorteo."
        });
        const embed = new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle("🎉 𝐒𝐎𝐑𝐓𝐄𝐎𝐒 ・ 𝐅𝐋𝐔𝐗 𝐒𝐓𝐎𝐑𝐄")
          .setDescription("Aquí se publicarán los sorteos oficiales, premios y ganadores.\n\n✦ Revisa los requisitos de cada sorteo.\n✦ Participa desde el botón del mensaje.\n✦ No compartas contraseñas ni códigos de acceso.")
          .setFooter({ text: "FLUX STORE ✦ ¡Mucha suerte!" });
        await channel.send({ embeds: [embed] }).catch(() => {});
        return ok("Categoría de sorteos lista: " + category + " • Canal: " + channel);
      }
      case "ticket-panel": {
        if (!need(PermissionFlagsBits.ManageChannels)) return;
        const categories = Object.entries(config.ticket.categories || {});
        if (!categories.length) return fail("No hay categorías de tickets configuradas.");
        const options = categories.map(([value, c]) => ({
          label: String(c.label || value).slice(0, 100),
          value,
          description: String(c.description || "Abre un ticket.").slice(0, 100),
          emoji: emojiData(message.guild, c.emojiKey || value, "🎫")
        }));
        const menu = new StringSelectMenuBuilder().setCustomId("ticket_create").setPlaceholder("Selecciona una categoría").setMinValues(1).setMaxValues(1).addOptions(options);
        const embed = new EmbedBuilder()
          .setColor(config.colors.primary)
          .setTitle("✦ 𝐅𝐋𝐔𝐗 𝐒𝐓𝐎𝐑𝐄 ・ 𝐂𝐄𝐍𝐓𝐑𝐎 𝐃𝐄 𝐀𝐓𝐄𝐍𝐂𝐈Ó𝐍 ✦")
          .setDescription([
            "╭─────────────── ⋆｡°✩",
            "  ¡𝐁𝐢𝐞𝐧𝐯𝐞𝐧𝐢𝐝𝐨 𝐚 **Flux STORE**!",
            "  Estamos aquí para ayudarte con tus compras, dudas y colaboraciones.",
            "╰─────────────── ⋆｡°✩",
            "",
            "✧ **𝐂Ó𝐌𝐎 𝐅𝐔𝐍𝐂𝐈𝐎𝐍𝐀**",
            "┊ Elige una opción del menú para abrir un canal privado.",
            "┊ Describe tu solicitud con claridad para que podamos ayudarte más rápido.",
            "┊ Nunca compartas contraseñas ni datos sensibles.",
            "┊ Máximo de tickets abiertos por persona: **" + config.ticket.maxOpenPerUser + "**.",
            "",
            "✧ **𝐄𝐋𝐈𝐆𝐄 𝐓𝐔 𝐒𝐎𝐋𝐈𝐂𝐈𝐓𝐔𝐃**",
            categories.map(([type, c]) => emoji(message.guild, c.emojiKey || type, "🎫") + " **" + c.label + "**\n_" + c.description + "_").join("\n\n"),
            "",
            "୨୧ Gracias por formar parte de **Flux STORE**. Nuestro equipo te atenderá en cuanto pueda."
          ].join("\n"))
          .setFooter({ text: "FLUX STORE  ✦  Soporte privado • Atención al cliente" })
          .setTimestamp();
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
  if (ch?.isTextBased()) {
    const embed = new EmbedBuilder().setColor(config.colors.primary)
      .setTitle("✦ ʙɪᴇɴᴠᴇɴɪᴅᴏ ᴀ ғʟᴜx sᴛᴏʀᴇ ✦")
      .setDescription("¡Qué bueno tenerte por aquí, " + member + "!\n\nExplora los canales, revisa las normas y abre un ticket si necesitas ayuda.\n\n✧ **ᴍɪᴇᴍʙʀᴏ ɴᴜᴍᴇʀᴏ:** " + member.guild.memberCount)
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .setFooter({ text: "Flux STORE • Gracias por unirte a la comunidad" }).setTimestamp();
    await ch.send({ embeds: [embed] }).catch(() => {});
  }
  await storeService.refreshCounters(member.guild);
});

client.on(Events.GuildMemberRemove, async member => {
  const ch = member.guild.channels.cache.get(config.channels.welcome);
  if (ch?.isTextBased()) await ch.send(emoji(member.guild, "info", "👋") + " **" + (member.user?.tag || "Un miembro") + "** ha salido de Flux Store.").catch(() => {});
  await storeService.refreshCounters(member.guild);
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
