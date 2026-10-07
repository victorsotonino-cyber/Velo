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
  ["Velo", "Velo", "brand"],
  ["Velo_Staff", "Velo_Staff", "staff"],
  ["Velo_Support", "Velo_Support", "support"],
  ["Velo_Ticket", "Velo_Ticket", "ticket"],
  ["Velo_Developer", "Velo_Developer", "developer"],
  ["Velo_Designer", "Velo_Designer", "designer"],
  ["Velo_Verified", "Velo_Verified", "verified"],
  ["Velo_Warning", "Velo_Warning", "warning"],
  ["Velo_Success", "Velo_Success", "success"],
  ["Velo_Error", "Velo_Error", "error"]
];

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = Array.from({ length: 256 }, (_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      return c >>> 0;
    });
  }
  let c = 0xFFFFFFFF;
  for (const b of buf) c = table[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  t.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([t, data])), 8 + data.length);
  return out;
}

function generatedVeloEmoji(kind) {
  const size = 128;
  const pixels = Buffer.alloc(size * size * 4, 0);
  const set = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const p = (y * size + x) * 4;
    pixels[p] = r; pixels[p + 1] = g; pixels[p + 2] = b; pixels[p + 3] = a;
  };
  const circle = (cx, cy, rad, color) => {
    const rr = rad * rad;
    for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= rr) set(x, y, ...color);
    }
  };
  const rect = (x1, y1, x2, y2, color) => {
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) set(x, y, ...color);
  };
  const line = (x1, y1, x2, y2, w, color) => {
    const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1), 1);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = Math.round(x1 + (x2 - x1) * t), y = Math.round(y1 + (y2 - y1) * t);
      for (let yy = -w; yy <= w; yy++) for (let xx = -w; xx <= w; xx++) set(x + xx, y + yy, ...color);
    }
  };
  // Estilo Velo rojo: degradado visual, borde oscuro y textura para que no se vean planos.
  const red = [190, 24, 48, 255], red2 = [125, 12, 28, 255], red3 = [235, 48, 70, 255];
  const white = [255,255,255,255], dark = [38,10,16,255], shine = [255,150,160,150];
  circle(64,64,61,dark); circle(64,64,57,red2); circle(64,64,53,red);
  // Textura punteada/diagonal sutil.
  for (let y = 18; y < 111; y += 6) for (let x = 18; x < 111; x += 6) {
    if (((x * 3 + y * 5) % 17) < 7) set(x, y, ...shine);
  }
  circle(48,42,15,[255,70,90,55]);
  line(28,31,91,18,2,[255,110,125,80]);
  if (kind === "brand") { line(34,42,64,88,6,white); line(64,88,94,42,6,white); line(39,44,64,82,2,red3); }
  else if (kind === "staff") { circle(64,48,16,white); circle(64,48,10,red3); rect(39,70,89,91,white); line(44,61,31,76,4,white); line(84,61,97,76,4,white); }
  else if (kind === "support") { circle(64,64,34,white); circle(64,64,25,red2); rect(27,61,39,78,white); rect(89,61,101,78,white); line(39,80,52,91,4,white); line(52,91,70,91,4,white); }
  else if (kind === "ticket") { rect(30,43,98,85,white); rect(39,52,89,76,red2); line(48,64,80,64,4,white); for (let x=43;x<88;x+=9) line(x,54,x,74,1,red3); }
  else if (kind === "developer") { line(40,45,25,64,5,white); line(25,64,40,83,5,white); line(88,45,103,64,5,white); line(103,64,88,83,5,white); line(57,84,71,44,5,white); }
  else if (kind === "designer") { line(35,88,88,35,10,white); line(88,35,98,45,10,white); line(35,88,31,99,4,white); line(42,81,84,39,2,red3); }
  else if (kind === "verified" || kind === "success") { line(32,65,55,87,7,white); line(55,87,98,40,7,white); }
  else if (kind === "warning") { line(64,32,64,74,6,white); circle(64,91,5,white); }
  else if (kind === "error") { line(39,39,89,89,7,white); line(89,39,39,89,7,white); }
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const zlib = require("zlib");
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size,0); ihdr.writeUInt32BE(size,4); ihdr[8]=8; ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), pngChunk("IHDR",ihdr), pngChunk("IDAT",zlib.deflateSync(raw,{level:9})), pngChunk("IEND",Buffer.alloc(0))]);
}

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
      return i.reply({ content: emoji(i.guild, "velo_error", "") + " Necesitas el permiso **Gestionar expresiones**.", ephemeral: true });
    }

    const me = i.guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return i.reply({ content: emoji(i.guild, "error", "❌") + " Velo necesita **Gestionar expresiones** para subir emojis.", ephemeral: true });
    }

    const tipo = i.options.getString("tipo");
    const list = tipo === "velo_staff"
      ? VELO_STAFF.map(x => ({ generated: true, name: x[1], kind: x[2], animated: false }))
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
        const buffer = item.generated ? generatedVeloEmoji(item.kind) : await download(item.url);
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
      .setTitle(emoji(i.guild, "velo", "") + " Emojis personalizados de Velo Studio")
      .setDescription(
        "Emojis personalizados reales de Discord, no Unicode.\n\n" +
        emoji(i.guild, "velo_success", "") + " Añadidos: **" + added.length + "**\n" +
        emoji(i.guild, "velo_new", "") + " Ya existían: **" + skipped.length + "**\n" +
        emoji(i.guild, "error", "❌") + " Fallaron: **" + failed.length + "**"
      );

    if (added.length) e.addFields({ name: emoji(i.guild, "velo_new", "") + " Emojis añadidos", value: added.slice(0, 20).join("\n").slice(0, 1024) });
    if (failed.length) e.addFields({ name: emoji(i.guild, "error", "❌") + " No se pudieron subir", value: failed.slice(0, 10).join("\n").slice(0, 1024) });

    return i.editReply({ embeds: [e] });
  }
};
