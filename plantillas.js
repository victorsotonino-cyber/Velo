const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require("discord.js");
const config = require("./config");
const { readJSON, writeJSON } = require("./storage");

const FILE = "server-templates.json";
const MAX_TEMPLATES = 15;
const MAX_CHANNELS = 100;
function cleanName(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9áéíóúñ _-]/gi, "").slice(0, 40);
}
function isAdmin(i) {
  return i.memberPermissions?.has(PermissionFlagsBits.Administrator) || i.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}
function getTemplates() {
  const data = readJSON(FILE, {});
  return data && typeof data === "object" && !Array.isArray(data) ? data : {};
}
function kind(c) {
  if (c.type === ChannelType.GuildCategory) return "category";
  if (c.type === ChannelType.GuildText) return "text";
  if (c.type === ChannelType.GuildVoice) return "voice";
  if (c.type === ChannelType.GuildAnnouncement) return "announcement";
  if (c.type === ChannelType.GuildForum) return "forum";
  if (c.type === ChannelType.GuildStageVoice) return "stage";
  return null;
}
function channelType(type) {
  return ({ category: ChannelType.GuildCategory, text: ChannelType.GuildText, voice: ChannelType.GuildVoice,
    announcement: ChannelType.GuildAnnouncement, forum: ChannelType.GuildForum, stage: ChannelType.GuildStageVoice })[type];
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("plantillas").setDescription("Guarda y recrea la estructura de canales del servidor.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName("guardar").setDescription("Guarda las categorías y canales actuales.")
      .addStringOption(o => o.setName("nombre").setDescription("Nombre de la plantilla").setRequired(true).setMaxLength(40)))
    .addSubcommand(s => s.setName("listar").setDescription("Muestra las plantillas guardadas."))
    .addSubcommand(s => s.setName("cargar").setDescription("Crea los canales de una plantilla guardada.")
      .addStringOption(o => o.setName("nombre").setDescription("Nombre de la plantilla").setRequired(true).setMaxLength(40)))
    .addSubcommand(s => s.setName("eliminar").setDescription("Elimina una plantilla guardada.")
      .addStringOption(o => o.setName("nombre").setDescription("Nombre de la plantilla").setRequired(true).setMaxLength(40))),

  async execute(i) {
    if (!i.guild) return i.reply({ content: "Este comando solo funciona dentro de un servidor.", ephemeral: true });
    if (!isAdmin(i)) return i.reply({ content: "Necesitas Administrador o Gestionar servidor.", ephemeral: true });
    const sub = i.options.getSubcommand();
    const guild = i.guild;
    const templates = getTemplates();

    if (sub === "guardar") {
      await i.deferReply({ ephemeral: true });
      const name = cleanName(i.options.getString("nombre"));
      if (!name) return i.editReply("Pon un nombre válido para la plantilla.");
      const currentCount = Object.values(templates).filter(t => t?.guildId === guild.id).length;
      if (!templates[name] && currentCount >= MAX_TEMPLATES) return i.editReply("Límite alcanzado: " + MAX_TEMPLATES + " plantillas por servidor.");
      await guild.channels.fetch();
      const channels = [...guild.channels.cache.values()].filter(c => kind(c)).sort((a, b) => {
        const ap = a.parent ? a.parent.position : a.position;
        const bp = b.parent ? b.parent.position : b.position;
        return ap - bp || a.position - b.position;
      }).slice(0, MAX_CHANNELS).map(c => ({
        name: c.name, type: kind(c), parentName: c.parent?.name || null,
        topic: "topic" in c ? (c.topic || null) : null,
        nsfw: "nsfw" in c ? Boolean(c.nsfw) : false,
        rateLimitPerUser: "rateLimitPerUser" in c ? c.rateLimitPerUser : 0,
        bitrate: "bitrate" in c ? c.bitrate : undefined,
        userLimit: "userLimit" in c ? c.userLimit : undefined,
        position: c.position
      }));
      templates[name] = { name, guildId: guild.id, guildName: guild.name, savedBy: i.user.id, savedAt: new Date().toISOString(), channels };
      writeJSON(FILE, templates);
      const embed = new EmbedBuilder().setColor(config.colors.success).setTitle("📦 Plantilla guardada")
        .setDescription("Se guardó " + name + " con " + channels.length + " categorías y canales.")
        .addFields({ name: "Servidor", value: guild.name, inline: true },
          { name: "Límite", value: MAX_TEMPLATES + " plantillas", inline: true },
          { name: "Incluye", value: "Categorías, canales de texto y voz, anuncios, foros, escenarios, temas y ajustes básicos." })
        .setFooter({ text: "Velo Studio • Plantillas" }).setTimestamp();
      return i.editReply({ embeds: [embed] });
    }

    if (sub === "listar") {
      const entries = Object.values(templates).filter(t => t?.guildId === guild.id);
      const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle("🗂️ Plantillas del servidor")
        .setDescription(entries.length ? entries.map(t => "• **" + t.name + "** — " + (t.channels?.length || 0) +
          " canales · <t:" + Math.floor(new Date(t.savedAt).getTime() / 1000) + ":R>").join("\n")
          : "No hay plantillas guardadas. Usa /plantillas guardar.")
        .setFooter({ text: entries.length + "/" + MAX_TEMPLATES + " plantillas • Velo Studio" });
      return i.reply({ embeds: [embed], ephemeral: true });
    }

    const name = cleanName(i.options.getString("nombre"));
    const template = templates[name];
    if (!template || template.guildId !== guild.id) return i.reply({ content: "No encuentro esa plantilla en este servidor. Usa /plantillas listar.", ephemeral: true });

    if (sub === "eliminar") {
      delete templates[name];
      writeJSON(FILE, templates);
      return i.reply({ content: "🗑️ Plantilla " + name + " eliminada.", ephemeral: true });
    }

    if (sub === "cargar") {
      await i.deferReply({ ephemeral: true });
      if (!guild.members.me?.permissions.has(PermissionFlagsBits.ManageChannels)) return i.editReply("Necesito el permiso Gestionar canales.");
      const records = Array.isArray(template.channels) ? template.channels.slice(0, MAX_CHANNELS) : [];
      const categories = new Map();
      let created = 0, skipped = 0;
      const errors = [];

      for (const r of records.filter(x => x.type === "category")) {
        try {
          let c = guild.channels.cache.find(x => x.type === ChannelType.GuildCategory && x.name === r.name);
          if (c) skipped++;
          else { c = await guild.channels.create({ name: r.name, type: ChannelType.GuildCategory, reason: "Restauración de plantilla " + name }); created++; }
          categories.set(r.name, c);
        } catch (e) { errors.push(r.name + ": " + (e.message || "error")); }
      }
      for (const r of records.filter(x => x.type !== "category")) {
        try {
          const parent = r.parentName ? categories.get(r.parentName) : null;
          const type = channelType(r.type);
          if (!type) { skipped++; continue; }
          const duplicate = guild.channels.cache.find(c => c.name === r.name && c.type === type && (c.parent?.name || null) === (parent?.name || null));
          if (duplicate) { skipped++; continue; }
          const opts = { name: r.name, type, reason: "Restauración de plantilla " + name };
          if (parent) opts.parent = parent.id;
          if ([ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum].includes(type)) {
            if (r.topic) opts.topic = r.topic;
            opts.nsfw = Boolean(r.nsfw);
          }
          if ([ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(type)) opts.rateLimitPerUser = Math.max(0, Math.min(21600, Number(r.rateLimitPerUser) || 0));
          if ([ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(type)) {
            if (Number.isFinite(r.bitrate)) opts.bitrate = r.bitrate;
            if (Number.isFinite(r.userLimit)) opts.userLimit = r.userLimit;
          }
          await guild.channels.create(opts);
          created++;
        } catch (e) { errors.push(r.name + ": " + (e.message || "error")); }
      }
      const embed = new EmbedBuilder().setColor(errors.length ? config.colors.warning : config.colors.success)
        .setTitle("🧩 Restauración de plantilla")
        .setDescription("Plantilla: **" + name + "**\nSe añaden canales; no se borra ni reemplaza ningún canal existente.")
        .addFields({ name: "Creados", value: String(created), inline: true },
          { name: "Ya existían", value: String(skipped), inline: true },
          { name: "Errores", value: String(errors.length), inline: true })
        .setFooter({ text: "Velo Studio • Plantillas" }).setTimestamp();
      if (errors.length) embed.addFields({ name: "Detalles", value: errors.slice(0, 8).map(e => "• " + e.slice(0, 150)).join("\n").slice(0, 1000) });
      return i.editReply({ embeds: [embed] });
    }
  }
};
