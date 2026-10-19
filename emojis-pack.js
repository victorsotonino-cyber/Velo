const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags
} = require("discord.js");
const config = require("./config");

const CDN = "https://cdn3.emoji.gg/emojis/";

// All uploaded artwork below is a direct PNG/GIF asset from Emoji.gg.
// No Unicode-to-image conversion and no generated substitutes.
const PACKS = {
  staff: [
    ["gg_staff_role", CDN + "845855-staffroleicon.png"],
    ["gg_mod_red", CDN + "694231-redmodroleicon.png"],
    ["gg_admin_blue", CDN + "361076-adminroleicon.png"],
    ["gg_admin_red", CDN + "114992-adminroleicon.png"],
    ["gg_admin_pink", CDN + "270537-adminroleicon.png"],
    ["gg_admin_alt1", CDN + "814576-adminroleicon.png"],
    ["gg_admin_alt2", CDN + "907495-adminroleicon.png"],
    ["gg_admin_alt3", CDN + "710500-adminroleicon.png"]
  ],
  owner: [
    ["gg_owner_holo", CDN + "221415-holographicownerroleicon.png"],
    ["gg_owner_black", CDN + "928868-blackownerroleicon.png"]
  ],
  tickets: [
    ["gg_ticket_gif", CDN + "993547-maketicket.gif"],
    ["gg_ticket_gif2", CDN + "560905-maketicket.gif"],
    ["gg_ticket_support", CDN + "687464-ticketsupportroleicon.png"],
    ["gg_ticket_helper", CDN + "382459-tickethelper.png"],
    ["gg_ticket_nitro", CDN + "148365-ticket-nitro.png"],
    ["gg_ticket_catgray", CDN + "39819-graycatticket.png"],
    ["gg_ticket_catpink", CDN + "418996-pinkcatticket.png"],
    ["gg_ticket_catwhite", CDN + "12130-whitecatticket.png"]
  ],
  tienda: [
    ["gg_cart_gif", CDN + "662519-shopping-cart.gif"],
    ["gg_cart_pink", CDN + "529053-cart.png"],
    ["gg_cart_white", CDN + "435031-shoppingcart.png"],
    ["gg_shopeepay", CDN + "273651-shopeepay.png"],
    ["gg_shopping_bag", CDN + "484462-shopping.png"],
    ["gg_cart_blue", CDN + "956768-shoppingcart.png"],
    ["gg_shop_gold", CDN + "71334-shop.png"],
    ["gg_primo_shopping", CDN + "15964-primo-shopping.png"],
    ["gg_shop_open", CDN + "76850-open.png"],
    ["gg_shop_bshop", CDN + "43311-shop-bshop.png"],
    ["gg_giveaway", CDN + "771156-giveaway.png"]
  ],
  pagos: [
    ["gg_mobilepay", CDN + "57431-mobilepay.png"],
    ["gg_paypal", CDN + "43974-paypal.png"],
    ["gg_gcash", CDN + "4233-gcash.png"],
    ["gg_payments_nitro", CDN + "7496-payments-nitro.gif"],
    ["gg_payments_gif", CDN + "9190-payments.gif"],
    ["gg_ltc", CDN + "4887-ltc.png"],
    ["gg_paysafecard", CDN + "6573-paysafecard.png"]
  ],
  verificados: [
    ["gg_bluetick", CDN + "537021-bluetick.png"],
    ["gg_verified_ids", CDN + "788693-verified-ids.png"],
    ["gg_verified_green", CDN + "766839-verified-green.png"],
    ["gg_blueverified", CDN + "816113-blueverifiedbadge.png"],
    ["gg_blackverified", CDN + "562006-blackverifiedbadge.png"],
    ["gg_verification_badge", CDN + "419617-verificationbadge.png"],
    ["gg_check_purple", CDN + "5707-lightpurplecheck.gif"],
    ["gg_check_pink", CDN + "14586-babypinkcheck.gif"]
  ],
  animados: [
    ["gg_ticket_gif", CDN + "993547-maketicket.gif"],
    ["gg_ticket_gif2", CDN + "560905-maketicket.gif"],
    ["gg_cart_gif", CDN + "662519-shopping-cart.gif"],
    ["gg_payments_nitro", CDN + "7496-payments-nitro.gif"],
    ["gg_payments_gif", CDN + "9190-payments.gif"],
    ["gg_check_purple", CDN + "5707-lightpurplecheck.gif"],
    ["gg_check_pink", CDN + "14586-babypinkcheck.gif"]
  ]
};

const LABELS = {
  staff: "Staff y moderación",
  owner: "Owner",
  tickets: "Tickets",
  tienda: "Tienda",
  pagos: "Pagos",
  verificados: "Verificados",
  animados: "Animados",
  todo: "Todos los packs de Emoji.gg"
};

// Names from the old Unicode/Twemoji installer. Only bot-authored emojis
// from these lists may be removed when replacing the old pack.
const LEGACY_NAMES = {
  staff: ["staff", "staff_team", "staff_check", "staff_help", "staff_support", "staff_tools", "staff_online", "staff_offline", "mod_ban", "mod_kick", "mod_mute", "mod_warn", "mod_lock", "mod_unlock", "mod_report", "mod_logs"],
  owner: ["owner", "owner_star", "owner_server", "owner_settings", "owner_check"],
  tickets: ["ticket", "ticket_claim", "ticket_open", "ticket_close", "ticket_lock", "ticket_unlock", "ticket_reply", "ticket_wait"],
  tienda: ["shop_store", "shop_cart", "shop_bag", "shop_gift", "shop_sale", "shop_new", "shop_premium", "shop_delivery", "shop_box", "shop_check", "shop_coin", "shop_receipt", "shop_support", "shop_discount", "shop_coupon", "shop_percent", "shop_price", "shop_tag", "shop_stock", "shop_out_stock", "shop_preorder", "shop_limited", "shop_best_seller", "shop_popular", "shop_favorite", "shop_wishlist", "shop_flash_sale", "shop_promo", "shop_bundle", "shop_digital", "shop_download", "shop_license", "shop_key", "shop_custom", "shop_service", "shop_quality", "shop_guarantee", "shop_return", "shop_exchange", "shop_shipping", "shop_fast_delivery", "shop_tracking", "shop_address", "shop_package_open", "shop_package", "shop_pickup", "shop_clock", "shop_calendar", "shop_order", "shop_order_confirmed", "shop_pending", "shop_cancel", "shop_review", "shop_rating", "shop_vip", "shop_member", "shop_loyalty", "shop_points", "shop_reward", "shop_gift_card", "shop_donation", "shop_secure", "shop_lock", "shop_help", "shop_live_support"],
  pagos: ["pay_card", "pay_cash", "pay_money", "pay_wallet", "pay_bank", "pay_coin", "pay_receipt", "pay_invoice", "pay_success", "pay_pending", "pay_refund", "pay_crypto", "pay_dollar", "pay_euro", "pay_yen", "pay_pound"],
  verificados: ["success", "verified", "verify", "checkmark", "verified_green"],
  animados: [],
  extra: ["flag_us", "flag_ve", "flag_es", "flag_mx", "flag_co", "flag_ar", "community_people", "community_chat", "community_heart", "community_star", "community_partner", "community_verified", "community_event", "community_news", "community_announcement", "community_boost", "meme_laugh", "meme_lmao", "meme_skull", "meme_cry", "meme_eyes", "meme_fire", "meme_sus", "success", "error", "info", "loading", "arrow", "star", "bell", "gift"]
};

function selectedPacks(selected) {
  if (selected === "todo") return ["staff", "owner", "tickets", "tienda", "pagos", "verificados"];
  return [selected];
}

async function downloadEmoji(url) {
  const parsed = new URL(url);
  if (parsed.hostname !== "cdn3.emoji.gg") throw new Error("La fuente no es Emoji.gg");
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Emoji.gg respondió HTTP " + response.status);
  const type = String(response.headers.get("content-type") || "").toLowerCase();
  if (!type.startsWith("image/")) throw new Error("El enlace no devolvió una imagen");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error("La imagen está vacía");
  if (buffer.length > 256 * 1024) throw new Error("La imagen supera 256 KB");
  return buffer;
}

async function emojiAuthor(emoji) {
  const known = emoji.user || emoji.author || null;
  if (known) return known;
  if (typeof emoji.fetchAuthor !== "function") return null;
  try {
    return await emoji.fetchAuthor();
  } catch {
    return null;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("emojis-pack")
    .setDescription("Instala emojis personalizados reales de Emoji.gg.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions)
    .addStringOption(o => o
      .setName("pack")
      .setDescription("Elige imágenes PNG/GIF de Emoji.gg")
      .setRequired(true)
      .addChoices(
        { name: LABELS.staff, value: "staff" },
        { name: LABELS.owner, value: "owner" },
        { name: LABELS.tickets, value: "tickets" },
        { name: LABELS.tienda, value: "tienda" },
        { name: LABELS.pagos, value: "pagos" },
        { name: LABELS.verificados, value: "verificados" },
        { name: LABELS.animados, value: "animados" },
        { name: LABELS.todo, value: "todo" }
      )),

  async execute(i) {
    if (!i.guild) {
      return i.reply({ content: "Este comando solo funciona dentro de un servidor.", flags: MessageFlags.Ephemeral });
    }
    if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return i.reply({ content: "Necesitas el permiso Gestionar expresiones.", flags: MessageFlags.Ephemeral });
    }
    const me = i.guild.members.me;
    if (!me?.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) {
      return i.reply({ content: "Flux STORE necesita Gestionar expresiones para instalar el pack.", flags: MessageFlags.Ephemeral });
    }

    const selected = i.options.getString("pack", true);
    const keys = selectedPacks(selected);
    const items = [];
    const seen = new Set();
    for (const key of keys) {
      for (const item of PACKS[key] || []) {
        if (!seen.has(item[0])) {
          seen.add(item[0]);
          items.push({ name: item[0], url: item[1] });
        }
      }
    }
    if (!items.length) {
      return i.reply({ content: "El pack seleccionado no existe.", flags: MessageFlags.Ephemeral });
    }

    await i.deferReply({ flags: MessageFlags.Ephemeral });

    const legacyNames = selected === "todo"
      ? [...new Set(Object.values(LEGACY_NAMES).flat())]
      : [...new Set(LEGACY_NAMES[selected] || [])];

    let removed = 0;
    let protectedLegacy = 0;
    let processed = 0;
    let lastProgress = 0;
    const failed = [];
    const added = [];
    const skipped = [];

    await i.editReply({ content: "Flux STORE • Preparando " + items.length + " imágenes originales de Emoji.gg..." });

    // Only delete a legacy emoji after confirming the bot created it.
    for (const name of legacyNames) {
      const old = i.guild.emojis.cache.find(e => e.name === name);
      if (!old) continue;
      const author = await emojiAuthor(old);
      if (author?.id === i.client.user.id) {
        try {
          await old.delete("Replacing old Unicode/Twemoji icon with an Emoji.gg asset");
          removed++;
        } catch (error) {
          protectedLegacy++;
          failed.push(name + " (no se pudo reemplazar: " + String(error?.message || error).slice(0, 60) + ")");
        }
      } else {
        protectedLegacy++;
      }
    }

    for (const item of items) {
      const exists = i.guild.emojis.cache.find(e => e.name === item.name);
      if (exists) {
        skipped.push(item.name + " (ya existe)");
        processed++;
        continue;
      }
      try {
        const buffer = await downloadEmoji(item.url);
        const created = await i.guild.emojis.create({
          attachment: buffer,
          name: item.name,
          reason: "Emoji.gg custom emoji pack for Flux STORE"
        });
        added.push("<:" + created.name + ":" + created.id + "> " + item.name);
      } catch (error) {
        failed.push(item.name + " (" + String(error?.message || error).slice(0, 75) + ")");
      }
      processed++;
      const now = Date.now();
      if (processed % 3 === 0 || now - lastProgress > 1000 || processed === items.length) {
        await i.editReply({
          content: "Flux STORE • Instalando " + processed + "/" + items.length + " emojis de Emoji.gg\nAñadidos: " + added.length + " · Existían: " + skipped.length + " · Antiguos retirados: " + removed + " · Fallaron: " + failed.length
        }).catch(() => {});
        lastProgress = Date.now();
      }
    }

    const embed = new EmbedBuilder()
      .setColor(config.colors?.primary || 0x8B5CF6)
      .setTitle("Flux STORE • Pack de Emoji.gg terminado")
      .setURL("https://emoji.gg/")
      .setDescription(
        "Este pack usa archivos PNG/GIF originales alojados en Emoji.gg; no dibuja ni convierte emojis Unicode en imágenes.\n\n" +
        "Instalados: " + added.length + "\n" +
        "Ya existían: " + skipped.length + "\n" +
        "Iconos antiguos del bot retirados: " + removed + "\n" +
        "Iconos antiguos protegidos/no identificados: " + protectedLegacy + "\n" +
        "Fallaron: " + failed.length
      )
      .setFooter({ text: "Flux STORE • Imágenes de Emoji.gg" })
      .setTimestamp();

    if (added.length) embed.addFields({
      name: "Muestra de emojis instalados",
      value: added.slice(0, 12).join("\n").slice(0, 1024)
    });
    if (failed.length) embed.addFields({
      name: "Fallos (muestra)",
      value: failed.slice(0, 8).join("\n").slice(0, 1024)
    });
    if (protectedLegacy) embed.addFields({
      name: "Nota sobre iconos antiguos",
      value: "Algunos iconos viejos no se borraron porque no pude confirmar que los creó este bot. Los emojis de otros autores se conservaron."
    });

    return i.editReply({ content: null, embeds: [embed] });
  }
};
