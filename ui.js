const FALLBACKS = {
  brand: "✨", success: "✅", error: "❌", info: "ℹ️", ticket: "🎫", moderation: "🛡️",
  fun: "🎮", warning: "⚠️", slow: "🐌", lock: "🔒", announcement: "📢", settings: "⚙️",
  users: "👥", channel: "📁", money: "💰", edit: "✏️", trash: "🗑️", add: "➕",
  remove: "➖", bot: "🤖", arrow: "➡️", minecraft: "⛏️", pvp: "⚔️"
};

const NAMES = {
  brand: ["Velo","velo","Velo_Logo"],
  success: ["Velo_Success","velo_success","corazon","catkiss_a"],
  error: ["Velo_Error","velo_error","gato_llorando","reaccion"],
  info: ["gatito","catkiss"],
  ticket: ["Velo_Ticket","velo_ticket","ticket","catkiss_a"],
  moderation: ["Velo_Staff","velo_staff","dwayne","crown_a"],
  fun: ["kekw","pepelaugh_a"],
  warning: ["Velo_Warning","velo_warning","gato_llorando"],
  slow: ["punch_a"],
  lock: ["crown_a","zredcrown"],
  announcement: ["Velo_Announcement","velo_announcement","hype_a","catjam_a"],
  settings: ["awee","corazon"],
  users: ["gatito","waitwhat_a"],
  channel: ["flecha","arrowred"],
  money: ["corazon","awee"],
  edit: ["reaccion","flecha"],
  trash: ["gato_llorando","punch_a"],
  add: ["catkiss","corazon"],
  remove: ["gato_llorando","reaccion"],
  bot: ["kekw","pepelaugh_a"],
  arrow: ["flecha","arrowred"],
  minecraft: ["Minecraft","mc_icon","minecraft"],
  pvp: ["PvpGod","Player_vs_Player_PVP","pvp","PVP"],
  velo: ["Velo","velo","Velo_Logo"],
  velo_staff: ["Velo_Staff","velo_staff","staff"],
  velo_support: ["Velo_Support","velo_support","support"],
  velo_ticket: ["Velo_Ticket","velo_ticket","ticket"],
  velo_buy: ["Velo_Buy","velo_buy","buy"],
  velo_reclaim: ["Velo_Reclaim","velo_reclaim","reclaim"],
  velo_boost: ["Velo_Boost","velo_boost","boost"],
  velo_partner: ["Velo_Partner","velo_partner","partner"],
  velo_developer: ["Velo_Developer","velo_developer","developer"],
  velo_designer: ["Velo_Designer","velo_designer","designer"],
  velo_verified: ["Velo_Verified","velo_verified","verified"],
  velo_warning: ["Velo_Warning","velo_warning","warning"],
  velo_success: ["Velo_Success","velo_success","success"],
  velo_error: ["Velo_Error","velo_error","error"],
  velo_announcement: ["Velo_Announcement","velo_announcement","announcement"],
  velo_giveaway: ["Velo_Giveaway","velo_giveaway","giveaway"],
  velo_premium: ["Velo_Premium","velo_premium","premium"],
  velo_gift: ["Velo_Gift","velo_gift","gift"],
  velo_loading: ["Velo_Loading","velo_loading","loading"],
  velo_new: ["Velo_New","velo_new","new"]
};

function find(guild, names) {
  if (!guild?.emojis?.cache) return null;
  for (const name of names || []) {
    const found = guild.emojis.cache.find(e => e.name === name);
    if (found) return found;
  }
  return null;
}

function emoji(guild, key, fallback) {
  const found = find(guild, NAMES[key] || []);
  return found ? found.toString() : (fallback || FALLBACKS[key] || FALLBACKS.brand);
}

function emojiData(guild, key, fallback) {
  const found = find(guild, NAMES[key] || []);
  if (found) return { id: found.id, name: found.name, animated: found.animated };
  const unicode = fallback || FALLBACKS[key] || FALLBACKS.brand;
  return { name: unicode };
}

module.exports = { emoji, emojiData, FALLBACKS, NAMES };
