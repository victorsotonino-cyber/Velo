const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require("discord.js");

const config = require("./config");

const STATIC_EMOJIS = [
  ["😀", "cara_feliz"],
  ["😂", "risa"],
  ["🤣", "risa2"],
  ["😍", "enamorado"],
  ["🥰", "amor"],
  ["😎", "cool"],
  ["🤔", "pensando"],
  ["😱", "sorprendido"],
  ["😭", "llorando"],
  ["😡", "enojado"],
  ["🤬", "enfadado"],
  ["😴", "durmiendo"],
  ["🤯", "loco"],
  ["🥳", "fiesta"],
  ["😈", "diablo"],
  ["👀", "ojos"],
  ["👍", "like"],
  ["👎", "dislike"],
  ["❤️", "corazon"],
  ["🔥", "fuego"],
  ["💯", "cien"],
  ["✨", "brillos"],
  ["💀", "calavera"],
  ["🚀", "cohete"],
  ["🎉", "fiesta2"],
  ["💰", "dinero"],
  ["⚡", "rayo"],
  ["❗", "alerta"],
  ["❓", "pregunta"],
  ["✅", "correcto"]
];

const ANIMATED = [
  ["😀", "cara_feliz_a"],
  ["😂", "risa_a"],
  ["🤣", "risa2_a"],
  ["😍", "enamorado_a"],
  ["🥰", "amor_a"],
  ["😎", "cool_a"],
  ["🤔", "pensando_a"],
  ["😱", "sorprendido_a"],
  ["😭", "llorando_a"],
  ["😡", "enojado_a"],
  ["🤬", "enfadado_a"],
  ["😴", "durmiendo_a"],
  ["🤯", "loco_a"],
  ["🥳", "fiesta_a"],
  ["😈", "diablo_a"],
  ["👀", "ojos_a"],
  ["👍", "like_a"],
  ["❤️", "corazon_a"],
  ["🔥", "fuego_a"],
  ["💀", "calavera_a"]
];

function codepoints(emoji) {
  return [...emoji].map(c => c.codePointAt(0).toString(16)).join("-");
}

function staticUrl(emoji) {
  return "https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/" + codepoints(emoji) + ".png";
}

function animatedUrl(emoji) {
  return "https://fonts.gstatic.com/s/e/notoemoji/latest/" + codepoints(emoji) + "/512.gif";
}

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status);
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > 256 * 1024) throw new Error("archivo demasiado grande (" + Math.round(buffer.length / 1024) + " KB)");
  return buffer;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("emoji-pack")
    .setDescription("Añade emojis normales y animados al servidor.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
    .addStringOption(o =>
      o.setName("tipo")
        .setDescription("Qué emojis quieres añadir")
        .setRequired(true)
        .addChoices(
          { name: "Todos", value: "todos" },
          { name: "Normales", value: "normales" },
          { name: "Animados", value: "animados" }
        )
    ),

  async execute(i) {
    if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return i.reply({ content: "❌ Necesitas el permiso **Gestionar expresiones**.", ephemeral: true });
    }

    const me = i.guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return i.reply({ content: "❌ Velo necesita **Gestionar expresiones** para añadir emojis.", ephemeral: true });
    }

    const tipo = i.options.getString("tipo");
    const list = tipo === "normales"
      ? STATIC_EMOJIS.map(x => ({ ...x, animated: false }))
      : tipo === "animados"
        ? ANIMATED.map(x => ({ ...x, animated: true }))
        : [
            ...STATIC_EMOJIS.map(x => ({ ...x, animated: false })),
            ...ANIMATED.map(x => ({ ...x, animated: true }))
          ];

    await i.deferReply({ ephemeral: true });

    const existing = new Set(i.guild.emojis.cache.map(e => e.name));
    const added = [];
    const skipped = [];
    const failed = [];

    for (const { 0: emoji, 1: name, animated } of list) {
      if (existing.has(name)) {
        skipped.push(name + " (ya existe)");
        continue;
      }

      try {
        const url = animated ? animatedUrl(emoji) : staticUrl(emoji);
        const buffer = await download(url);
        const created = await i.guild.emojis.create({
          attachment: buffer,
          name,
          reason: "Pack de emojis de Velo Studio"
        });
        added.push(created.toString() + " `" + name + "`");
        existing.add(name);
      } catch (e) {
        failed.push(name + " (" + e.message + ")");
      }
    }

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle("🎨 Pack de emojis de Velo Studio")
      .setDescription(
        "✅ Añadidos: **" + added.length + "**\n" +
        "⏭️ Ya existían: **" + skipped.length + "**\n" +
        "❌ Fallaron: **" + failed.length + "**"
      );

    if (added.length) embed.addFields({ name: "Añadidos", value: added.slice(0, 20).join("\n").slice(0, 1024) });
    if (failed.length) embed.addFields({ name: "Fallos", value: failed.slice(0, 10).join("\n").slice(0, 1024) });

    return i.editReply({ embeds: [embed] });
  }
};
