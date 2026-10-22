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
    welcome: env("WELCOME_CHANNEL_ID", "1562615450834178179"),
    logs: env("LOGS_CHANNEL_ID", "1550131492578132010"),
    tickets: env("TICKETS_CATEGORY_ID", "1554962090295562240"),
    announcements: env("ANNOUNCEMENTS_CHANNEL_ID", "1550131491588014181")
  },
  roles: {
    admin: env("ADMIN_ROLE_ID", "1550131491151945778"),
    staff: env("STAFF_ROLE_ID", "1552119717597028515"),
    member: env("MEMBER_ROLE_ID", "1562619913485557901")
  },
  ticket: {
    maxOpenPerUser: Number.isFinite(Number(process.env.MAX_TICKETS_PER_USER)) && process.env.MAX_TICKETS_PER_USER
      ? Math.max(1, Math.min(10, Number(process.env.MAX_TICKETS_PER_USER)))
      : 2,
    closeDelayMs: 5000,
    categories: {
      compras: { label: "Compras y pedidos", emojiId: "1550146329915949077", emojiName: "emoji_20", emojiKey: "emoji_20", description: "Pedidos, productos, pagos, entregas y seguimiento de compras." },
      dudas: { label: "Dudas y soporte", emojiId: "1561921833203142757", emojiName: "emoji_138", emojiKey: "emoji_138", description: "Resuelve preguntas sobre productos, servicios o cómo comprar." },
      reportes: { label: "Reportes e incidencias", emojiId: "1561921915658969099", emojiName: "emoji_139", emojiKey: "emoji_139", description: "Comunica problemas, incidencias o situaciones que requieran revisión." },
      partner: { label: "Partner / Colaboraciones", emojiId: "1561698594136920214", emojiName: "flux_pandahiyapolice_2219", emojiKey: "flux_pandahiyapolice_2219", description: "Presenta propuestas de colaboración y acuerdos con FLUX STORE." },
      ally: { label: "Alianzas", emojiId: "1561551235285385227", emojiName: "flux_owner_4264", emojiKey: "flux_owner_4264", description: "Solicita una alianza, promoción o colaboración entre comunidades." }
    }
  }
};
