const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const config = require("./config");
const { emoji } = require("./ui");

const STATIC_EMOJIS = [
  ["https://cdn.discordapp.com/emojis/616284569758466194.png?v=1", "minecraft"],
  ["https://cdn3.emoji.gg/emojis/535376-hardcoreheart.png", "hardcoreheart"],
  ["https://cdn3.emoji.gg/emojis/8444-pvp.png", "pvp"],
  ["https://cdn3.emoji.gg/emojis/9230-player-vs-player-pvp.png", "player_pvp"],
  ["https://cdn.discordemojihub.com/discordemojihub/emojis/2026/06/a378d612-c148-45c7-a373-12ff1707ff63.png", "dwayne"],
  ["https://cdn.discordemojihub.com/discordemojihub/emojis/2026/07/da22f9ae-31ae-46d9-9583-675832ac0cb0.png", "catkiss"],
  ["https://cdn.discordemojihub.com/discordemojihub/emojis/2026/06/e448023f-8557-44db-bb5c-d38921ed6413.png", "gatito"],
  ["https://cdn.discordemojihub.com/discordemojihub/emojis/2026/06/07f38361-87dc-4e18-b4d1-1e45c38949c9.png", "gato_llorando"],
  ["https://cdn.discordemojihub.com/discordemojihub/emojis/2026/07/110b0121-0284-45be-9c94-2ae7739106ee.png", "kekw"],
  ["https://cdn.discordemojihub.com/discordemojihub/emojis/2026/07/596d27f8-329d-4065-a7c3-72be26a81060.png", "flecha"],
  ["https://cdn.discordemojihub.com/discordemojihub/emojis/2026/07/653c3d74-0e3a-4b30-8feb-28ad4485d132.png", "corazon"],
  ["https://cdn.discordemojihub.com/discordemojihub/emojis/2026/07/f8a9d072-114a-4b46-8af2-8ecd9b3700cf.png", "reaccion"],
  ["https://cdn.discordemojihub.com/discordemojihub/emojis/2026/07/b9da867c-ca80-412e-aadb-9154420e332e.png", "awee"],
  ["https://cdn.discordemojihub.com/discordemojihub/emojis/2026/07/596d27f8-329d-4065-a7c3-72be26a81060.png", "arrowred"]
];

const VELO_STAFF = [
  ["https://raw.githubusercontent.com/victorsotonino-cyber/Velo/main/emojis/Velo.png", "Velo"],
  ["https://raw.githubusercontent.com/victorsotonino-cyber/Velo/main/emojis/Velo_Staff.png", "Velo_Staff"],
  ["https://raw.githubusercontent.com/victorsotonino-cyber/Velo/main/emojis/Velo_Support.png", "Velo_Support"],
  ["https://raw.githubusercontent.com/victorsotonino-cyber/Velo/main/emojis/Velo_Ticket.png", "Velo_Ticket"],
  ["https://raw.githubusercontent.com/victorsotonino-cyber/Velo/main/emojis/Velo_Developer.png", "Velo_Developer"],
  ["https://raw.githubusercontent.com/victorsotonino-cyber/Velo/main/emojis/Velo_Designer.png", "Velo_Designer"],
  ["https://raw.githubusercontent.com/victorsotonino-cyber/Velo/main/emojis/Velo_Verified.png", "Velo_Verified"],
  ["https://raw.githubusercontent.com/victorsotonino-cyber/Velo/main/emojis/Velo_Warning.png", "Velo_Warning"],
  ["https://raw.githubusercontent.com/victorsotonino-cyber/Velo/main/emojis/Velo_Success.png", "Velo_Success"],
  ["https://raw.githubusercontent.com/victorsotonino-cyber/Velo/main/emojis/Velo_Error.png", "Velo_Error"]
];

const ANIMATED = [
  ["https://cdn3.emoji.gg/emojis/505158-pvpgod.gif", "pvpgod"],
  ["https://cdn.discordemojihub.com/discordemojihub/emojis/2026/06/66102e65-573a-4ca5-b23a-c309d68ce702.gif", "catkiss_a"],
  ["https://cdn.discordemojihub.com/discordemojihub/emojis/2026/07/da8ccaf0-77e8-4b16-9af1-004c5c792f12.gif", "crown_a"],
  ["https://cdn.discordemojihub.com/discordemojihub/emojis/2026/07/105ae646-42dc-4bde-85cb-8aff3a3f8b6b.gif", "pepelaugh_a"],
  ["https://cdn.discordemojihub.com/discordemojihub/emojis/2026/07/ae425a00-5ee7-4b38-81c8-1b6efc208c15.gif", "wha_a"],
  ["https://cdn.discordemojihub.com/discordemojihub/emojis/2026/07/4f39a0f5-f698-4d86-8ef7-0d100f7287f6.gif", "punch_a"],
  ["https://cdn.discordemojihub.com/discordemojihub/emojis/2026/06/04fcee42-606a-4810-8901-ea5d27573978.gif", "catjam_a"],
  ["https://cdn.discordemojihub.com/discordemojihub/emojis/2026/06/6298bbb4-1d04-423a-9c1f-713f25454861.gif", "waitwhat_a"],
  ["https://cdn.discordemojihub.com/discordemojihub/emojis/2026/07/f83fb5dd-2a87-48f2-9670-920b835dd3e3.gif", "hype_a"]
];

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
    .setDescription("Añade emojis personalizados estilo Discord.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
    .addStringOption(o => o.setName("tipo").setDescription("Qué pack quieres añadir").setRequired(true).addChoices(
      { name: "Todos", value: "todos" },
      { name: "Velo Staff", value: "velo_staff" },
      { name: "Normales", value: "normales" },
      { name: "Animados", value: "animados" }
    )),

  async execute(i) {
    if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return i.reply({ content: emoji(i.guild, "error", "❌") + " Necesitas el permiso **Gestionar expresiones**.", ephemeral: true });
    }

    const me = i.guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return i.reply({ content: emoji(i.guild, "error", "❌") + " Velo necesita **Gestionar expresiones** para subir emojis.", ephemeral: true });
    }

    const tipo = i.options.getString("tipo");
    const list = tipo === "velo_staff"
      ? VELO_STAFF.map(x => ({ url: x[0], name: x[1], animated: false }))
      : tipo === "normales"
      ? STATIC_EMOJIS.map(x => ({ url: x[0], name: x[1], animated: false }))
      : tipo === "animados"
        ? ANIMATED.map(x => ({ url: x[0], name: x[1], animated: true }))
        : [
            ...STATIC_EMOJIS.map(x => ({ url: x[0], name: x[1], animated: false })),
            ...ANIMATED.map(x => ({ url: x[0], name: x[1], animated: true }))
          ];

    await i.deferReply({ ephemeral: true });
    const existing = new Set(i.guild.emojis.cache.map(e => e.name));
    const added = [];
    const skipped = [];
    const failed = [];

    for (const item of list) {
      if (existing.has(item.name)) {
        skipped.push(item.name + " (ya existe)");
        continue;
      }

      try {
        const buffer = await download(item.url);
        const created = await i.guild.emojis.create({
          attachment: buffer,
          name: item.name,
          reason: "Pack de emojis personalizados de Velo Studio"
        });
        added.push(created.toString() + " \`" + item.name + "\`");
        existing.add(item.name);
      } catch (e) {
        failed.push(item.name + " (" + e.message + ")");
      }
    }

    const e = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle(emoji(i.guild, "brand", "🎨") + " Emojis personalizados de Velo Studio")
      .setDescription(
        "Emojis personalizados reales de Discord, no Unicode.\n\n" +
        emoji(i.guild, "success", "✅") + " Añadidos: **" + added.length + "**\n" +
        emoji(i.guild, "info", "⏭️") + " Ya existían: **" + skipped.length + "**\n" +
        emoji(i.guild, "error", "❌") + " Fallaron: **" + failed.length + "**"
      );

    if (added.length) e.addFields({ name: emoji(i.guild, "add", "➕") + " Emojis añadidos", value: added.slice(0, 20).join("\n").slice(0, 1024) });
    if (failed.length) e.addFields({ name: emoji(i.guild, "error", "❌") + " No se pudieron subir", value: failed.slice(0, 10).join("\n").slice(0, 1024) });

    return i.editReply({ embeds: [e] });
  }
};
