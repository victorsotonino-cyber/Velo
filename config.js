require("dotenv").config();

const env = name => process.env[name] || "";

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  paymentMethodsText: process.env.PAYMENT_METHODS_TEXT || "",
  storeCurrency: process.env.STORE_CURRENCY || "USD",
  colors: {
    primary: 0x8B5CF6,
    dark: 0x111111,
    success: 0x22C55E,
    warning: 0xF59E0B,
    error: 0xEF4444
  },
  channels: {
    welcome: env("WELCOME_CHANNEL_ID"),
    logs: env("LOGS_CHANNEL_ID"),
    tickets: env("TICKETS_CATEGORY_ID"),
    announcements: env("ANNOUNCEMENTS_CHANNEL_ID"),
    terms: env("TERMS_CHANNEL_ID"),
    paymentMethods: env("PAYMENT_METHODS_CHANNEL_ID"),
    ticketInfo: env("TICKETS_INFO_CHANNEL_ID"),
    suggestions: env("SUGGESTIONS_CHANNEL_ID"),
    reviews: env("REVIEWS_CHANNEL_ID"),
    orderLogs: env("ORDER_LOG_CHANNEL_ID")
  },
  roles: {
    admin: env("ADMIN_ROLE_ID"),
    staff: env("STAFF_ROLE_ID"),
    member: env("MEMBER_ROLE_ID")
  },
  ticket: {
    maxOpenPerUser: Number.isFinite(Number(process.env.MAX_TICKETS_PER_USER)) && process.env.MAX_TICKETS_PER_USER
      ? Math.max(1, Math.min(10, Number(process.env.MAX_TICKETS_PER_USER)))
      : 2,
    closeDelayMs: 5000,
    categories: {
      compras: {
        label: "Compras y pedidos",
        emojiId: env("TICKET_EMOJI_COMPRAS_ID"),
        emojiName: "emoji_20",
        emojiKey: "emoji_20",
        description: "Pedidos, productos, pagos, entregas y seguimiento de compras."
      },
      dudas: {
        label: "Dudas y soporte",
        emojiId: env("TICKET_EMOJI_DUDAS_ID"),
        emojiName: "emoji_138",
        emojiKey: "emoji_138",
        description: "Resuelve preguntas sobre productos, servicios o cómo comprar."
      },
      reportes: {
        label: "Reportes e incidencias",
        emojiId: env("TICKET_EMOJI_REPORTES_ID"),
        emojiName: "emoji_139",
        emojiKey: "emoji_139",
        description: "Comunica problemas, incidencias o situaciones que requieran revisión."
      },
      partner: {
        label: "Partner / Colaboraciones",
        emojiId: env("TICKET_EMOJI_PARTNER_ID"),
        emojiName: "flux_pandahiyapolice_2219",
        emojiKey: "flux_pandahiyapolice_2219",
        description: "Presenta propuestas de colaboración y acuerdos con FLUX STORE."
      },
      ally: {
        label: "Alianzas",
        emojiId: env("TICKET_EMOJI_ALLY_ID"),
        emojiName: "flux_owner_4264",
        emojiKey: "flux_owner_4264",
        description: "Solicita una alianza, promoción o colaboración entre comunidades."
      }
    }
  }
};
