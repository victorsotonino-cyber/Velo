// Emoji resolver for the SrP Store-style emoji pack.
// Uses custom emojis already uploaded to the Discord server; remote Emoji.gg images
// cannot be used as native Discord button/select emojis until they exist in the guild.
const FALLBACKS = {
  brand: "🛍️", success: "✅", error: "❌", info: "ℹ️", ticket: "🎫",
  moderation: "🛡️", staff: "🛡️", fun: "🎮", warning: "⚠️", slow: "🐢",
  lock: "🔒", announcement: "📢", settings: "⚙️", users: "👥",
  channel: "📁", money: "💰", edit: "✏️", trash: "🗑️", add: "➕",
  remove: "➖", bot: "🤖", arrow: "➡️", minecraft: "⛏️", pvp: "⚔️",
  shop: "🛍️", store: "🏪", cart: "🛒", order: "📦", discount: "🏷️",
  invoice: "🧾", payment: "💳", paypal: "💳", binance: "💳", visa: "💳",
  mastercard: "💳", applepay: "📱", googlepay: "📱", cashapp: "💵",
  bank: "🏦", transfer: "🔁", crypto: "🪙", bitcoin: "₿", ethereum: "💠",
  usdt: "💵", wallet: "👛", refund: "↩️", delivery: "🚚", stock: "📦",
  product: "🎁", coupon: "🎟️", flag: "🏳️", usa: "🇺🇸", venezuela: "🇻🇪",
  spain: "🇪🇸", mexico: "🇲🇽", colombia: "🇨🇴", argentina: "🇦🇷",
  chile: "🇨🇱", peru: "🇵🇪", brazil: "🇧🇷", dominican: "🇩🇴",
  ecuador: "🇪🇨", uruguay: "🇺🇾", paraguay: "🇵🇾", bolivia: "🇧🇴",
  panama: "🇵🇦", costa_rica: "🇨🇷", guatemala: "🇬🇹", el_salvador: "🇸🇻",
  honduras: "🇭🇳", nicaragua: "🇳🇮", cuba: "🇨🇺", uk: "🇬🇧",
  canada: "🇨🇦", france: "🇫🇷", germany: "🇩🇪", italy: "🇮🇹",
  portugal: "🇵🇹", japan: "🇯🇵", korea: "🇰🇷", china: "🇨🇳"
};

// Names are intentionally pack-neutral: this also works if the downloaded pack
// uses slightly different names such as srp_staff, staff_team, srp_store, or store_logo.
const NAMES = {
  brand: ["srp_store", "srpstore", "srp_logo", "store_logo", "shop_logo", "store", "shop"],
  success: ["success", "check", "verified", "approved", "complete", "done", "tick"],
  error: ["error", "failed", "cancel", "denied", "cross", "wrong"],
  info: ["info", "information", "question", "help"],
  ticket: ["ticket", "support_ticket", "ticket_open", "helpdesk"],
  moderation: ["staff", "moderator", "moderation", "admin", "team"],
  staff: ["staff", "staff_team", "team", "helper", "moderator", "admin"],
  fun: ["fun", "gaming", "game"],
  warning: ["warning", "alert", "caution"],
  slow: ["slowmode", "slow"],
  lock: ["lock", "locked", "secure"],
  announcement: ["announcement", "announce", "news"],
  settings: ["settings", "setting", "config", "gear"],
  users: ["users", "members", "member", "people"],
  channel: ["channel", "channels", "category", "folder"],
  money: ["money", "cash", "coins", "currency"],
  edit: ["edit", "pencil", "modify"],
  trash: ["delete", "trash", "remove", "close_ticket"],
  add: ["add", "plus", "create"],
  remove: ["remove", "minus"],
  bot: ["bot", "discord_bot"],
  arrow: ["arrow", "next"],
  minecraft: ["minecraft", "mc"],
  pvp: ["pvp", "sword"],
  shop: ["srp_store", "srpstore", "shop", "store", "store_logo", "shopping", "shop_icon", "tienda"],
  store: ["srp_store", "srpstore", "store", "store_logo", "shop", "tienda"],
  cart: ["cart", "shopping_cart", "basket", "carrito"],
  order: ["order", "orders", "pedido", "package", "box"],
  discount: ["discount", "sale", "offer", "descuento", "deal"],
  invoice: ["invoice", "receipt", "bill", "factura"],
  payment: ["payment", "payments", "pay", "checkout", "pago"],
  paypal: ["paypal"], binance: ["binance"], visa: ["visa"],
  mastercard: ["mastercard"], applepay: ["applepay", "apple_pay"],
  googlepay: ["googlepay", "google_pay"], cashapp: ["cashapp", "cash_app"],
  bank: ["bank", "banco"], transfer: ["transfer", "transferencia"],
  crypto: ["crypto", "cryptocurrency"], bitcoin: ["bitcoin", "btc"],
  ethereum: ["ethereum", "eth"], usdt: ["usdt", "tether"], wallet: ["wallet"],
  refund: ["refund", "refunds", "reembolso"], delivery: ["delivery", "shipping", "entrega"],
  stock: ["stock", "inventory", "inventario"], product: ["product", "products", "producto"],
  coupon: ["coupon", "promo", "cupon"],
  flag: ["flag", "country_flag"], usa: ["usa", "united_states", "flag_us"],
  venezuela: ["venezuela", "flag_ve"], spain: ["spain", "espana", "flag_es"],
  mexico: ["mexico", "flag_mx"], colombia: ["colombia", "flag_co"],
  argentina: ["argentina", "flag_ar"], chile: ["chile", "flag_cl"],
  peru: ["peru", "flag_pe"], brazil: ["brazil", "brasil", "flag_br"],
  dominican: ["dominican_republic", "republica_dominicana"],
  ecuador: ["ecuador", "flag_ec"], uruguay: ["uruguay", "flag_uy"],
  paraguay: ["paraguay", "flag_py"], bolivia: ["bolivia", "flag_bo"],
  panama: ["panama", "flag_pa"], costa_rica: ["costa_rica"],
  guatemala: ["guatemala"], el_salvador: ["el_salvador"],
  honduras: ["honduras"], nicaragua: ["nicaragua"], cuba: ["cuba"],
  uk: ["uk", "united_kingdom", "flag_gb"], canada: ["canada", "flag_ca"],
  france: ["france"], germany: ["germany", "deutschland"], italy: ["italy", "italia"],
  portugal: ["portugal"], japan: ["japan"], korea: ["korea", "south_korea"], china: ["china"],
  shop_support: ["support", "soporte", "help", "headset", "customer_service"],
  shop_reward: ["reward", "rewards", "gift", "regalo"],
  shop_store: ["srp_store", "srpstore", "store", "shop", "tienda"],
  shop_other: ["other", "otros", "help"],
  velo: ["srp_store", "srpstore", "store_logo", "shop_logo"],
  velo_staff: ["staff", "staff_team", "team", "helper", "moderator", "admin"],
  velo_support: ["support", "soporte", "help", "headset", "customer_service"],
  velo_ticket: ["ticket", "support_ticket", "ticket_open", "helpdesk"],
  velo_buy: ["buy", "purchase", "shop", "store", "shopping", "cart", "basket", "sell", "tienda", "payment"],
  velo_reclaim: ["claim", "reclaim", "refund", "complaint", "reclamo", "support"],
  velo_other: ["other", "otros", "help"],
  velo_boost: ["boost", "booster"],
  velo_partner: ["partner", "partnership", "affiliate"],
  velo_developer: ["developer", "developer_role", "code"],
  velo_designer: ["designer", "design"],
  velo_verified: ["verified", "check", "approved"],
  velo_warning: ["warning", "alert"],
  velo_success: ["success", "check", "verified"],
  velo_error: ["error", "failed", "cancel"],
  velo_announcement: ["announcement", "announce", "news"],
  velo_giveaway: ["giveaway", "give_away", "raffle"],
  velo_premium: ["premium", "vip"],
  velo_gift: ["gift", "giftcard", "regalo"],
  velo_loading: ["loading", "processing"],
  velo_new: ["new", "nuevo"],
  shop_paypal: ["paypal"], shop_binance: ["binance"], shop_visa: ["visa"],
  shop_mastercard: ["mastercard"], shop_applepay: ["applepay", "apple_pay"],
  shop_googlepay: ["googlepay", "google_pay"], shop_cashapp: ["cashapp", "cash_app"],
  shop_stripe: ["stripe"], shop_coinbase: ["coinbase"], shop_bitcoin: ["bitcoin", "btc"],
  shop_ethereum: ["ethereum", "eth"], shop_usdt: ["usdt", "tether"],
  shop_litecoin: ["litecoin", "ltc"], shop_solana: ["solana", "sol"],
  shop_xrp: ["xrp", "ripple"], shop_wallet: ["wallet"], shop_cart: ["cart", "basket"],
  shop_order: ["order", "pedido"], shop_delivery: ["delivery", "shipping"],
  shop_refund: ["refund", "reembolso"], shop_discount: ["discount", "sale"],
  shop_coupon: ["coupon", "promo"], shop_invoice: ["invoice", "receipt"],
  shop_receipt: ["receipt", "recibo"], shop_stock: ["stock", "inventory"],
  shop_product: ["product", "producto"], shop_digital: ["digital"],
  shop_premium: ["premium", "vip"], shop_gift: ["gift", "regalo"],
  shop_subscription: ["subscription", "suscripcion"], shop_support_ticket: ["support", "helpdesk"],
  shop_verified: ["verified", "check"], shop_secure: ["secure", "security"],
  shop_warning: ["warning", "alert"], shop_success: ["success", "check"],
  shop_error: ["error", "failed"], shop_pending: ["pending", "processing"],
  shop_completed: ["completed", "done"], shop_cancelled: ["cancelled", "canceled"],
  shop_pay: ["pay", "payment"], shop_cash: ["cash", "money"],
  shop_bank: ["bank", "banco"], shop_transfer: ["transfer", "wire"],
  shop_payoneer: ["payoneer"], shop_paysafecard: ["paysafecard"],
  shop_revolut: ["revolut"], shop_wise: ["wise"], shop_zelle: ["zelle"],
  shop_venmo: ["venmo"], shop_paytm: ["paytm"], shop_phonepe: ["phonepe"],
  shop_gcash: ["gcash"], shop_maya: ["maya"], shop_pix: ["pix"],
  shop_mercadopago: ["mercadopago", "mercado_pago"], shop_nequi: ["nequi"],
  shop_daviplata: ["daviplata"], shop_bancolombia: ["bancolombia"],
  shop_pago_movil: ["pago_movil", "pagomovil"], shop_zinli: ["zinli"],
  shop_binance_pay: ["binance_pay"], shop_bnb: ["bnb"], shop_usdc: ["usdc"],
  shop_doge: ["dogecoin", "doge"], shop_tron: ["tron", "trx"], shop_ton: ["ton", "toncoin"],
  shop_polygon: ["polygon", "matic", "pol"], shop_avax: ["avalanche", "avax"],
  shop_dot: ["polkadot", "dot"], shop_ada: ["cardano", "ada"], shop_link: ["chainlink", "link"],
  shop_shib: ["shiba", "shib"], shop_pepe: ["pepe"], shop_nft: ["nft"],
  shop_giftcard: ["giftcard", "gift_card"], shop_key: ["key", "license_key"],
  shop_license: ["license", "licencia"], shop_download: ["download", "descarga"],
  shop_cloud: ["cloud", "nube"], shop_code: ["code", "codigo"],
  shop_tools: ["tools", "herramientas"], shop_config: ["config", "configuracion"],
  shop_design: ["design", "designer"], shop_bot: ["bot", "discord_bot"],
  shop_plugin: ["plugin", "plugins"], shop_minecraft: ["minecraft", "mc"],
  shop_discord: ["discord"], shop_nitro: ["nitro"], shop_robux: ["robux", "roblox"],
  shop_steam: ["steam"], shop_gaming: ["gaming", "games", "juegos"],
  shop_coins: ["coins", "monedas"], shop_points: ["points", "puntos"],
  shop_reward_box: ["reward", "mystery_box"], shop_vip: ["vip"],
  shop_member: ["member", "miembro"], shop_partner: ["partner", "socio"],
  shop_affiliate: ["affiliate", "afiliado"], shop_commission: ["commission", "comision"],
  shop_earnings: ["earnings", "ganancias"], shop_profit: ["profit", "beneficio"],
  shop_analytics: ["analytics", "estadisticas"], shop_stats: ["stats", "estadisticas"],
  shop_settings: ["settings", "ajustes"], shop_admin: ["admin", "administracion"],
  shop_staff: ["staff", "team", "helper", "moderator"],
  shop_moderator: ["moderator", "moderador"], shop_contact: ["contact", "contacto"],
  shop_chat: ["chat", "message", "mensaje"], shop_mail: ["mail", "email"],
  shop_link: ["link", "enlace"], shop_qr: ["qr", "qrcode"],
  shop_mobile: ["mobile", "movil"], shop_desktop: ["desktop", "pc"],
  shop_global: ["global", "worldwide"], shop_local: ["local", "region"],
  shop_clock: ["clock", "time", "tiempo"], shop_calendar: ["calendar", "calendario"],
  shop_fast: ["fast", "rapido"], shop_quality: ["quality", "calidad"],
  shop_best: ["best", "top"], shop_new: ["new", "nuevo"], shop_hot: ["hot", "popular"],
  shop_sale: ["sale", "oferta"], shop_limited: ["limited", "limitado"],
  shop_comingsoon: ["comingsoon", "proximamente"], shop_info: ["info", "informacion"],
  shop_question: ["question", "pregunta"], shop_faq: ["faq"],
  shop_rules: ["rules", "reglas"], shop_terms: ["terms", "terminos"],
  shop_privacy: ["privacy", "privacidad"], shop_status: ["status", "estado"],
  shop_online: ["online", "enlinea"], shop_offline: ["offline", "desconectado"],
  shop_loading: ["loading", "cargando"], shop_wait: ["wait", "espera"],
  shop_star: ["star", "estrella"], shop_fire: ["fire", "fuego"],
  shop_crown: ["crown", "corona"], shop_diamond: ["diamond", "diamante"],
  shop_gem: ["gem", "gema"], shop_trophy: ["trophy", "trofeo"],
  shop_medal: ["medal", "medalla"], shop_badge: ["badge", "insignia"],
  shop_check: ["check", "tick", "confirmado"], shop_cross: ["cross", "xmark", "cancel"],
  shop_plus: ["plus", "agregar"], shop_minus: ["minus", "quitar"],
  shop_edit: ["edit", "editar"], shop_delete: ["delete", "eliminar"],
  shop_refresh: ["refresh", "actualizar"], shop_search: ["search", "buscar"],
  shop_filter: ["filter", "filtrar"], shop_sort: ["sort", "ordenar"],
  shop_list: ["list", "lista"], shop_grid: ["grid", "cuadricula"],
  shop_box: ["box", "caja"], shop_package: ["package", "paquete"],
  shop_truck: ["truck", "camion"], shop_globe: ["globe", "mundo"],
  shop_handshake: ["handshake", "acuerdo"], shop_heart: ["heart", "corazon"],
  shop_thanks: ["thanks", "gracias"], shop_welcome: ["welcome", "bienvenido"]
};

const LEGACY_NAME = /^(?:emoji_?(?:9|10|11|17|23)|sellix|flux_blobbanhammerc_3392)$/i;

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function isLegacyEmoji(e) {
  const name = String(e?.name || "");
  const n = normalize(name);
  return LEGACY_NAME.test(name) || n.startsWith("velo") || n.startsWith("flux") ||
    ["gatito", "catkiss", "catkissa", "gatollorando", "reaccion", "dwayne", "hypea", "catjama"].includes(n);
}

function find(guild, names) {
  const cache = guild?.emojis?.cache;
  if (!cache) return null;
  const candidates = [...cache.values()].filter(e => !isLegacyEmoji(e));
  const normalizedNames = (names || []).map(normalize).filter(n => n.length >= 3);
  for (const target of normalizedNames) {
    const exact = candidates.find(e => normalize(e.name) === target);
    if (exact) return exact;
  }
  // If a pack prefixes names with "srp" or "store", match the meaningful suffix.
  for (const target of normalizedNames) {
    const match = candidates.find(e => {
      const name = normalize(e.name);
      return name.length >= 3 && (name.includes(target) || target.includes(name));
    });
    if (match) return match;
  }
  return null;
}

function emoji(guild, key, fallback) {
  const found = find(guild, NAMES[key] || [key]);
  return found ? found.toString() : (fallback || FALLBACKS[key] || FALLBACKS.brand);
}

function commandEmoji(guild, command, fallback) {
  const name = normalize(command);
  const found = find(guild, ["srp_" + name, "srp" + name, name, "cmd_" + name, "command_" + name]);
  return found ? found.toString() : (fallback || FALLBACKS.info);
}

function emojiData(guild, key, fallback) {
  const found = find(guild, NAMES[key] || [key]);
  if (found) return { id: found.id, name: found.name, animated: found.animated };
  return { name: fallback || FALLBACKS[key] || FALLBACKS.brand };
}

module.exports = { emoji, emojiData, commandEmoji, FALLBACKS, NAMES, find };
