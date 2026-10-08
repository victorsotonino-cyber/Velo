require("dotenv").config();

const env = (name, fallback) => process.env[name] || fallback;

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  colors: {
    primary: 0xE11D2E,
    dark: 0x111111,
    success: 0x22C55E,
    warning: 0xF59E0B,
    error: 0xEF4444
  },
  channels: {
    welcome: env("WELCOME_CHANNEL_ID", "1550131491588014180"),
    logs: env("LOGS_CHANNEL_ID", "1550131492578132010"),
    tickets: env("TICKETS_CATEGORY_ID", "1554962090295562240"),
    announcements: env("ANNOUNCEMENTS_CHANNEL_ID", "1550131491588014181")
  },
  roles: {
    admin: env("ADMIN_ROLE_ID", "1550131491151945778"),
    staff: env("STAFF_ROLE_ID", "1552119717597028515"),
    member: env("MEMBER_ROLE_ID", "1550131491080507477")
  },
  ticket: {
    maxOpenPerUser: Math.max(1, Math.min(10, Number(process.env.MAX_TICKETS_PER_USER || 2))),
    closeDelayMs: 5000,
    categories: {
      soporte: { label: "Soporte", emojiKey: "velo_support", emojiId: null, emojiName: null, description: "Ayuda, dudas o problemas con Velo Studio." },
      comprar: { label: "Comprar", emojiKey: "velo_buy", emojiId: null, emojiName: null, description: "Compras, productos, precios y servicios." },
      reclamos: { label: "Reclamos", emojiKey: "velo_reclaim", emojiId: null, emojiName: null, description: "Reclamos, incidencias o problemas con una compra." },
      otros: { label: "Otros", emojiKey: "velo_ticket", emojiId: null, emojiName: null, description: "Cualquier consulta que no encaje en las anteriores." }
    }
  }
};
