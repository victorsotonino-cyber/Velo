require("dotenv").config();

const env = (name, fallback) => process.env[name] || fallback;

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  colors: {
    primary: 0x8B5CF6,
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
      compras: { label: "Compras", emojiKey: "flux_stockpenguin_4079", description: "Pedidos, productos, pagos y entregas de Flux STORE." },
      dudas: { label: "Dudas", emojiKey: "emoji_138", description: "Resuelve preguntas sobre nuestros servicios antes de comprar." },
      reportes: { label: "Reportes", emojiKey: "emoji_139", description: "Informa de un problema, incidencia o situación que debamos revisar." },
      partner: { label: "Partner", emojiKey: "flux_discord_staff_5163", description: "Propuestas de colaboración y acuerdos con Flux STORE." },
      ally: { label: "Alianzas", emojiKey: "flux_discord_staff_5163", description: "Solicita una alianza o promoción entre comunidades." }
    }
  }
};
