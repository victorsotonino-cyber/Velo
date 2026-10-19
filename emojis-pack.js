const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");

const BASE = "https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/";
const PACKS = {
  moderacion: ["mod_ban","🔨","mod_kick","👢","mod_mute","🔇","mod_warn","⚠️","mod_lock","🔒","mod_unlock","🔓","mod_report","🚨","mod_logs","📋"],
  owner: ["owner","👑","owner_star","⭐","owner_server","🏰","owner_settings","⚙️","owner_check","✅"],
  staff: ["staff","🛡️","staff_team","👥","staff_check","☑️","staff_help","🙋","staff_support","🎧","staff_tools","🧰","staff_online","🟢","staff_offline","🔴"],
  reclamar: ["ticket","🎫","ticket_claim","✋","ticket_open","📂","ticket_close","📁","ticket_lock","🔒","ticket_unlock","🔓","ticket_reply","💬","ticket_wait","⏳"],
  tienda: ["shop_store","🏪","shop_cart","🛒","shop_bag","🛍️","shop_gift","🎁","shop_sale","🏷️","shop_new","🆕","shop_premium","💎","shop_delivery","📦","shop_box","🎁","shop_check","🛍️","shop_coin","🪙","shop_receipt","🧾","shop_support","🛎️","shop_discount","💸","shop_coupon","🎟️","shop_percent","％","shop_price","💲","shop_tag","🔖","shop_stock","📦","shop_out_stock","🚫","shop_preorder","📝","shop_limited","⏳","shop_best_seller","🔥","shop_popular","⭐","shop_favorite","❤️","shop_wishlist","💖","shop_flash_sale","⚡","shop_promo","📣","shop_bundle","🎁","shop_digital","💻","shop_download","⬇️","shop_license","📜","shop_key","🔑","shop_custom","🛠️","shop_service","🧰","shop_quality","🏆","shop_guarantee","🛡️","shop_return","↩️","shop_exchange","🔄","shop_shipping","🚚","shop_fast_delivery","🚀","shop_tracking","🛰️","shop_address","📍","shop_package_open","📬","shop_package","📦","shop_pickup","🏬","shop_clock","🕒","shop_calendar","📅","shop_order","📋","shop_order_confirmed","✅","shop_pending","⏳","shop_cancel","❌","shop_review","🌟","shop_rating","⭐","shop_vip","👑","shop_member","🪪","shop_loyalty","🎖️","shop_points","💠","shop_reward","🎉","shop_gift_card","💳","shop_donation","🤍","shop_secure","🔐","shop_lock","🔒","shop_help","❓","shop_live_support","🎧"],
  pagos: ["pay_card","💳","pay_cash","💵","pay_money","💰","pay_wallet","👛","pay_bank","🏦","pay_coin","🪙","pay_receipt","🧾","pay_invoice","📄","pay_success","✅","pay_pending","⏳","pay_refund","↩️","pay_crypto","🪙","pay_dollar","💲","pay_euro","💶","pay_yen","💴","pay_pound","💷"],
  banderas: ["flag_us","🇺🇸","flag_ve","🇻🇪","flag_es","🇪🇸","flag_mx","🇲🇽","flag_co","🇨🇴","flag_ar","🇦🇷","flag_cl","🇨🇱","flag_pe","🇵🇪","flag_ec","🇪🇨","flag_br","🇧🇷","flag_do","🇩🇴","flag_pr","🇵🇷","flag_pa","🇵🇦","flag_cr","🇨🇷","flag_gt","🇬🇹","flag_sv","🇸🇻","flag_hn","🇭🇳","flag_ni","🇳🇮","flag_cu","🇨🇺","flag_uy","🇺🇾","flag_py","🇵🇾","flag_bo","🇧🇴","flag_ca","🇨🇦","flag_gb","🇬🇧","flag_fr","🇫🇷","flag_de","🇩🇪","flag_it","🇮🇹","flag_pt","🇵🇹"],
  comunidad: ["community_people","👥","community_chat","💬","community_heart","❤️","community_star","🌟","community_partner","🤝","community_verified","☑️","community_event","📅","community_news","📰","community_announcement","📢","community_boost","🚀"],
  meme: ["meme_laugh","😂","meme_lmao","🤣","meme_skull","💀","meme_cry","😭","meme_eyes","👀","meme_fire","🔥","meme_sus","🤨"],
  utilidad: ["success","✅","error","❌","info","ℹ️","loading","🔄","arrow","➡️","star","⭐","bell","🔔","gift","🎁"]
};
const LABELS = {
  moderacion:"🛡️ Moderación", owner:"👑 Owner", staff:"🛡️ Staff",
  reclamar:"🎫 Reclamar / Tickets", tienda:"🛍️ Tienda", pagos:"💳 Métodos de pago",
  banderas:"🌎 Banderas", comunidad:"🤝 Comunidad", meme:"😂 Meme", utilidad:"⚙️ Utilidad"
};
const choices = Object.entries(LABELS).map(([name,label]) => ({name:label,value:name}));
choices.push({name:"📦 Todo",value:"todo"});
function url(char) {
  const codepoints = Array.from(char).map(c => c.codePointAt(0).toString(16)).join("-");
  return BASE + codepoints + ".png";
}
async function install(guild, pack, onProgress = async () => {}) {
  const created=[], existing=[], failed=[];
  for (let n=0; n<pack.length; n+=2) {
    const name=pack[n], char=pack[n+1];
    if (guild.emojis.cache.some(e => e.name === name)) { existing.push(name); await onProgress(name, "existing"); continue; }
    try {
      const res=await fetch(url(char), { signal: AbortSignal.timeout(12000) });
      if (!res.ok) throw new Error("descarga no disponible");
      const buffer=Buffer.from(await res.arrayBuffer());
      if (buffer.length > 256 * 1024) throw new Error("archivo demasiado grande");
      const e=await guild.emojis.create({attachment:buffer,name,reason:"Velo Studio emoji pack"});
      created.push("<:"+e.name+":"+e.id+">");
      await onProgress(name, "created");
    } catch (err) { failed.push(name + " (" + String(err?.message || err).slice(0, 90) + ")"); await onProgress(name, "failed"); }
  }
  return {created,existing,failed};
}
module.exports = {
  data: new SlashCommandBuilder().setName("emojis-pack").setDescription("Instala packs de emojis para Velo Studio.").setDefaultMemberPermissions(PermissionFlagsBits.ManageGuildExpressions).addStringOption(o=>o.setName("pack").setDescription("Elige el pack").setRequired(true).addChoices(...choices)),
  async execute(i) {
    if (!i.guild) return i.reply({content:"❌ Solo funciona en un servidor.",ephemeral:true});
    if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuildExpressions)) return i.reply({content:"❌ Necesitas el permiso Gestionar expresiones.",ephemeral:true});
    if (!i.guild.members.me?.permissions.has(PermissionFlagsBits.ManageGuildExpressions)) return i.reply({content:"❌ Necesito Administrar expresiones.",ephemeral:true});
    const selected=i.options.getString("pack",true);
    await i.deferReply({ephemeral:true});
    const keys=selected==="todo"?Object.keys(PACKS):[selected];
    const total=keys.reduce((sum,key)=>sum+(PACKS[key]?.length || 0)/2,0);
    if (!total || keys.some(key=>!PACKS[key])) return i.editReply({content:"❌ El pack seleccionado no existe."});
    const all={created:[],existing:[],failed:[]};
    const live={created:0,existing:0,failed:0,processed:0};
    let lastUpdate=0;
    await i.editReply({content:"🟣 Flux STORE • Preparando **"+total+"** emojis…"});
    const onProgress=async (name,status)=>{
      live.processed++;
      if (status==="created") live.created++; else if (status==="existing") live.existing++; else live.failed++;
      const now=Date.now();
      if (live.processed%4!==0 && now-lastUpdate<1200 && live.processed<total) return;
      await i.editReply({content:"🟣 Flux STORE • Instalando **"+live.processed+"/"+total+"** emojis\\n✅ Añadidos: **"+live.created+"** · ♻️ Ya existían: **"+live.existing+"** · ⚠️ Fallaron: **"+live.failed+"**\\nÚltimo: `"+name+"`"}).catch(()=>{});
      lastUpdate=Date.now();
    };
    for (const key of keys) { const r=await install(i.guild,PACKS[key],onProgress); all.created.push(...r.created); all.existing.push(...r.existing); all.failed.push(...r.failed); }
    const embed=new EmbedBuilder().setColor(0xE11D2E).setTitle("Flux STORE • Emojis").setDescription("Pack solicitado: **"+(selected==="todo"?"Todos":LABELS[selected])+"**\nFuente de imágenes: Twemoji. Puedes explorar packs de tienda y pagos en https://emoji.gg/emojis/shop y https://emoji.gg/emojis/payments").addFields(
      {name:"✅ Instalados ("+all.created.length+")",value:all.created.length?all.created.slice(0,15).join(" "):"Ninguno"},
      {name:"📦 Ya existían ("+all.existing.length+")",value:all.existing.length?all.existing.slice(0,15).map(x=>"`"+x+"`").join(", "):"Ninguno"},
      {name:"⚠️ Fallaron ("+all.failed.length+")",value:all.failed.length?all.failed.slice(0,10).map(x=>"`"+x+"`").join(", "):"Ninguno"}
    ).setFooter({text:"Flux STORE • Emojis personalizados"}).setTimestamp();
    await i.editReply({embeds:[embed]});
  }
};
