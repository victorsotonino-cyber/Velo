const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const config = require("./config");
const { emoji } = require("./ui");

const STATIC_EMOJIS = [
  ["https://cdn.discordapp.com/emojis/616284569758466194.png?v=1", "minecraft"],
  ["https://cdn3.emoji.gg/emojis/535376-hardcoreheart.png", "hardcoreheart"],
  ["https://cdn3.emoji.gg/emojis/8444-pvp.png", "pvp"],
  ["https://cdn3.emoji.gg/emojis/9230-player-vs-player-pvp.png", "player_pvp"],
  ["https://cdn3.emoji.gg/emojis/662519-shopping-cart.gif", "shop_cart_a"],
  ["https://cdn3.emoji.gg/emojis/273651-shopeepay.png", "shopeepay"],
  ["https://cdn3.emoji.gg/emojis/737230-applepay.png", "applepay"],
  ["https://cdn3.emoji.gg/emojis/77525-binance.png", "binance"],
  ["https://cdn3.emoji.gg/emojis/71388-stripe.png", "stripe"],
  ["https://cdn3.emoji.gg/emojis/37700-sellix-logo.png", "sellix"],

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

const FLUX_PACK = [
  ["Flux_Store", "Flux_Store", "store"],
  ["Flux_Staff", "Flux_Staff", "staff"],
  ["Flux_Admin", "Flux_Admin", "admin"],
  ["Flux_Mod", "Flux_Mod", "mod"],
  ["Flux_Helper", "Flux_Helper", "helper"],
  ["Flux_Trial", "Flux_Trial", "trial"],
  ["Flux_Management", "Flux_Management", "management"],
  ["Flux_Support", "Flux_Support", "support"],
  ["Flux_Ticket", "Flux_Ticket", "ticket"],
  ["Flux_Claim", "Flux_Claim", "claim"],
  ["Flux_Closed", "Flux_Closed", "closed"],
  ["Flux_Developer", "Flux_Developer", "developer"],
  ["Flux_Coder", "Flux_Coder", "coder"],
  ["Flux_Designer", "Flux_Designer", "designer"],
  ["Flux_Verified", "Flux_Verified", "verified"],
  ["Flux_Warning", "Flux_Warning", "warning"],
  ["Flux_Ban", "Flux_Ban", "ban"],
  ["Flux_Muted", "Flux_Muted", "muted"],
  ["Flux_Success", "Flux_Success", "success"],
  ["Flux_Error", "Flux_Error", "error"],
  ["Flux_Loading", "Flux_Loading", "loading"],
  ["Flux_Online", "Flux_Online", "online"],
  ["Flux_Offline", "Flux_Offline", "offline"],
  ["Flux_Cart", "Flux_Cart", "cart"],
  ["Flux_Premium", "Flux_Premium", "premium"],
  ["Flux_Discount", "Flux_Discount", "discount"],
  ["Flux_Stock", "Flux_Stock", "stock"],
  ["Flux_Sold", "Flux_Sold", "sold"]
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

function generatedFluxEmoji(kind) {
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
  // Identidad Flux STORE: negro y morado neón, textura y transparencia exterior.
  const red = [137, 55, 255, 255], red2 = [45, 16, 75, 255], red3 = [205, 155, 255, 255];
  const white = [255,255,255,255], dark = [12,8,22,255], shine = [220,180,255,150];
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
  else if (kind === "error" || kind === "ban" || kind === "muted" || kind === "closed") { line(39,39,89,89,7,white); line(89,39,39,89,7,white); }
  else if (kind === "admin" || kind === "management") { circle(64,64,24,white); circle(64,64,12,red); for(let a=0;a<8;a++){const ang=a*Math.PI/4;rect(Math.round(61+Math.cos(ang)*25),Math.round(61+Math.sin(ang)*25),Math.round(67+Math.cos(ang)*34),Math.round(67+Math.sin(ang)*34),white);} }
  else if (kind === "helper" || kind === "trial") { circle(64,45,13,white); rect(43,64,85,88,white); line(48,71,80,71,3,red); }
  else if (kind === "coder" || kind === "claim") { line(42,45,25,64,5,white); line(25,64,42,83,5,white); line(86,45,103,64,5,white); line(103,64,86,83,5,white); }
  else if (kind === "store") { rect(34,51,94,91,white); rect(42,62,55,76,red2); rect(67,62,83,76,red2); line(30,49,98,49,5,white); }
  else if (kind === "cart") { line(28,37,38,37,3,white); line(38,37,48,74,3,white); line(48,74,91,74,3,white); line(91,74,100,48,3,white); circle(53,89,5,white); circle(86,89,5,white); }
  else if (kind === "premium") { line(30,84,42,43,4,white); line(42,43,63,66,4,white); line(63,66,85,43,4,white); line(85,43,98,84,4,white); line(30,84,98,84,4,white); }
  else if (kind === "discount") { circle(48,48,9,white); circle(80,80,9,white); line(40,88,88,40,5,white); }
  else if (kind === "stock" || kind === "sold") { rect(36,39,92,89,white); line(36,54,92,54,3,red); line(36,70,92,70,3,red); if(kind==="sold"){line(43,43,85,83,5,red3);line(85,43,43,83,5,red3);} }
  else if (kind === "loading") { circle(64,64,31,white); circle(64,64,19,red2); rect(61,28,67,48,red3); }
  else if (kind === "online") { circle(64,64,25,[80,255,150,255]); }
  else if (kind === "offline") { circle(64,64,25,[130,130,145,255]); }
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

const SHOP_EMOJIS = [
  ["🏪", "shop_store"], ["🛒", "shop_cart"], ["🛍️", "shop_bag"], ["🎁", "shop_gift"],
  ["🏷️", "shop_sale"], ["🆕", "shop_new"], ["💎", "shop_premium"], ["📦", "shop_delivery"],
  ["🧾", "shop_receipt"], ["🛎️", "shop_support"], ["💸", "shop_discount"], ["🎟️", "shop_coupon"],
  ["🔖", "shop_tag"], ["🚫", "shop_out_stock"], ["📝", "shop_preorder"], ["⏳", "shop_limited"],
  ["🔥", "shop_best_seller"], ["⭐", "shop_popular"], ["❤️", "shop_favorite"], ["💖", "shop_wishlist"],
  ["⚡", "shop_flash_sale"], ["📣", "shop_promo"], ["💻", "shop_digital"], ["⬇️", "shop_download"],
  ["📜", "shop_license"], ["🔑", "shop_key"], ["🛠️", "shop_custom"], ["🧰", "shop_service"],
  ["🏆", "shop_quality"], ["🛡️", "shop_guarantee"], ["↩️", "shop_return"], ["🔄", "shop_exchange"],
  ["🚚", "shop_shipping"], ["🚀", "shop_fast_delivery"], ["📍", "shop_address"], ["📬", "shop_package_open"],
  ["🏬", "shop_pickup"], ["🕒", "shop_clock"], ["📅", "shop_calendar"], ["📋", "shop_order"],
  ["✅", "shop_order_confirmed"], ["⏱️", "shop_pending"], ["❌", "shop_cancel"], ["🌟", "shop_review"],
  ["👑", "shop_vip"], ["🪪", "shop_member"], ["🎖️", "shop_loyalty"], ["💠", "shop_points"],
  ["🎉", "shop_reward"], ["💳", "shop_gift_card"], ["🔐", "shop_secure"], ["🔒", "shop_lock"],
  ["❓", "shop_help"], ["🎧", "shop_live_support"]
];

function twemojiUrl(char) {
  const code = Array.from(char).map(c => c.codePointAt(0).toString(16)).join("-");
  return "https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/" + code + ".png";
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
    .setDescription("Instala emojis personalizados de Flux STORE.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
    .addStringOption(o => o.setName("tipo").setDescription("Qué pack quieres añadir").setRequired(true).addChoices(
      { name: "Todos", value: "todos" },
      { name: "Tienda (50+)", value: "tienda" },
      { name: "Flux STORE • Staff y tienda", value: "velo_staff" },
      { name: "Normales", value: "normales" },
      { name: "Animados", value: "animados" }
    )),

  async execute(i) {
    if (!i.guild) return i.reply({ content: "❌ Este comando solo funciona dentro de un servidor.", ephemeral: true });
    if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return i.reply({ content: "❌ Necesitas el permiso **Gestionar expresiones**.", ephemeral: true });
    }
    const me = i.guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return i.reply({ content: "❌ Flux STORE necesita **Gestionar expresiones** para subir emojis.", ephemeral: true });
    }

    const tipo = i.options.getString("tipo", true);
    const fluxPack = FLUX_PACK.map(x => ({ generated: true, name: x[1], kind: x[2], animated: false }));
    const staticPack = STATIC_EMOJIS.map(x => ({ url: x[0], name: x[1], animated: false }));
    const shopPack = FLUX_PACK.map(x => ({ generated: true, name: x[1], kind: x[2], animated: false }));
    const animatedPack = ANIMATED.map(x => ({ url: x[0], name: x[1], animated: true }));
    const list = tipo === "velo_staff" ? fluxPack
      : tipo === "tienda" ? shopPack
      : tipo === "normales" ? staticPack
      : tipo === "animados" ? animatedPack
      : [...fluxPack, ...staticPack, ...animatedPack];

    // Reconoce la interacción inmediatamente para evitar que Discord la deje cargando.
    await i.deferReply({ ephemeral: true });
    const existing = new Set(i.guild.emojis.cache.map(e => e.name));
    const added = [];
    const skipped = [];
    const failed = [];
    let processed = 0;
    let lastProgressAt = Date.now();

    await i.editReply({ content: "🟣 Flux STORE • Preparando **" + list.length + "** emojis…" });

    for (const item of list) {
      if (existing.has(item.name)) {
        skipped.push(item.name + " (ya existe)");
        processed++;
      } else {
        try {
          // Los emojis se crean de uno en uno para respetar los límites de Discord.
          const buffer = item.generated ? generatedFluxEmoji(item.kind) : await download(item.url);
          const created = await i.guild.emojis.create({
            attachment: buffer,
            name: item.name,
            reason: "Pack de emojis personalizados de Flux STORE"
          });
          added.push(created.toString() + " \`" + item.name + "\`");
          existing.add(item.name);
        } catch (e) {
          failed.push(item.name + " (" + String(e.message || e).slice(0, 80) + ")");
        }
        processed++;
      }

      // Actualiza la respuesta cada 3 elementos o cada segundo, para que no parezca bloqueado.
      if (processed % 3 === 0 || Date.now() - lastProgressAt > 1000 || processed === list.length) {
        await i.editReply({
          content: "🟣 Flux STORE • Procesando emojis: **" + processed + "/" + list.length + "**\n✅ Añadidos: " + added.length + " · ♻️ Existían: " + skipped.length + " · ❌ Fallaron: " + failed.length
        }).catch(() => {});
        lastProgressAt = Date.now();
      }
    }

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary || 0x8B5CF6)
      .setTitle("Flux STORE • Emojis personalizados")
      .setDescription(
        "Pack terminado.\n\n" +
        "✅ Añadidos: **" + added.length + "**\n" +
        "♻️ Ya existían: **" + skipped.length + "**\n" +
        "❌ Fallaron: **" + failed.length + "**"
      );

    if (added.length) embed.addFields({ name: "Emojis añadidos (muestra)", value: added.slice(0, 15).join("\n").slice(0, 1024) });
    if (failed.length) embed.addFields({ name: "No se pudieron subir (muestra)", value: failed.slice(0, 10).join("\n").slice(0, 1024) });
    return i.editReply({ content: null, embeds: [embed] });
  }
};
