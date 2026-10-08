const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");

const PACK = [
  ["velo_owner", "👑"],
  ["velo_staff", "🛡️"],
  ["velo_reclaim", "♻️"],
  ["velo_moderacion", "🔨"],
  ["velo_support", "🎧"],
  ["velo_buy", "🛒"],
  ["velo_ticket", "🎫"],
  ["velo_success", "✅"],
  ["velo_error", "❌"],
  ["velo_announcement", "📢"],
  ["velo_giveaway", "🎁"],
  ["velo_dev", "💻"]
];

function twemojiUrl(char) {
  const code = Array.from(char).map(c => c.codePointAt(0).toString(16)).join("-");
  return "https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/" + code + ".png";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("emojis-pack")
    .setDescription("Instala el pack de emojis de Velo Studio en este servidor.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions),

  async execute(i) {
    if (!i.guild) return i.reply({ content: "❌ Este comando solo funciona dentro de un servidor.", ephemeral: true });
    if (!i.guild.members.me.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return i.reply({ content: "❌ Necesito el permiso Administrar expresiones para instalar el pack.", ephemeral: true });
    }

    await i.deferReply({ ephemeral: true });
    const created = [];
    const existing = [];
    const failed = [];

    for (const [name, char] of PACK) {
      if (i.guild.emojis.cache.some(e => e.name === name)) {
        existing.push(name);
        continue;
      }
      try {
        const response = await fetch(twemojiUrl(char));
        if (!response.ok) throw new Error("No se pudo descargar el emoji.");
        const buffer = Buffer.from(await response.arrayBuffer());
        const emoji = await i.guild.emojis.create({ attachment: buffer, name, reason: "Velo Studio emoji pack" });
        created.push("<:" + emoji.name + ":" + emoji.id + ">");
      } catch (error) {
        failed.push(name);
      }
    }

    const embed = new EmbedBuilder().setColor(0xE11D2E).setTitle("Velo Studio • Emoji Pack")
      .setDescription("Pack de emojis para **Owner, Staff, Reclaim, Moderación, Tickets y utilidades**.")
      .addFields(
        { name: "Instalados ahora", value: created.length ? created.join(" ") : "Ninguno" },
        { name: "Ya existían", value: existing.length ? existing.map(x => "`" + x + "`").join(", ") : "Ninguno" },
        { name: "No se pudieron instalar", value: failed.length ? failed.map(x => "`" + x + "`").join(", ") : "Ninguno" }
      ).setFooter({ text: "Velo Studio • Emoji Pack" }).setTimestamp();

    await i.editReply({ embeds: [embed] });
  }
};