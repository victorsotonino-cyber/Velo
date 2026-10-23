require("dotenv").config();

function readId(name) {
  const value = String(process.env[name] || "").trim();
  return /^\d{17,20}$/.test(value) ? value : null;
}

function readNumber(name, fallback, min, max) {
  const raw = process.env[name];
  if (raw === undefined || String(raw).trim() === "") return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  prefix: process.env.BOT_PREFIX || "!",
  colors: {
    primary: 0x8B5CF6,
    dark: 0x111111,
    success: 0x22C55E,
    warning: 0xF59E0B,
    error: 0xEF4444
  },
  channels: {
    // Canal de bienvenida predeterminado de FLUX STORE; .env puede sobrescribirlo.
    welcome: readId("WELCOME_CHANNEL_ID") || "1562615450834178179",
    logs: readId("LOGS_CHANNEL_ID") || "1562615500968820802",
    tickets: readId("TICKETS_CATEGORY_ID"),
    announcements: readId("ANNOUNCEMENTS_CHANNEL_ID"),
    terms: readId("TERMS_CHANNEL_ID") || "1562615455624077383",
    paymentMethods: readId("PAYMENT_METHODS_CHANNEL_ID") || "1562615459256471642",
    ticketInfo: readId("TICKET_INFO_CHANNEL_ID") || "1562615495704838174",
    transactions: readId("TRANSACTIONS_CHANNEL_ID") || "1562615500968820802",
    suggestions: readId("SUGGESTIONS_CHANNEL_ID"),
    reviews: readId("REVIEWS_CHANNEL_ID")
  },
  roles: {
    admin: readId("ADMIN_ROLE_ID"),
    staff: readId("STAFF_ROLE_ID"),
    member: readId("MEMBER_ROLE_ID")
  },
  store: {
    currency: String(process.env.STORE_CURRENCY || "USD").toUpperCase()
  },
  automod: {
    enabled: String(process.env.AUTOMOD_ENABLED || "true").toLowerCase() === "true",
    maxMessages: readNumber("AUTOMOD_MAX_MESSAGES", 6, 3, 15),
    windowSeconds: readNumber("AUTOMOD_WINDOW_SECONDS", 7, 3, 30),
    duplicateLimit: readNumber("AUTOMOD_DUPLICATE_LIMIT", 3, 2, 8),
    maxMentions: readNumber("AUTOMOD_MAX_MENTIONS", 5, 2, 15),
    timeoutMinutes: readNumber("AUTOMOD_TIMEOUT_MINUTES", 5, 1, 1440),
    blockInvites: String(process.env.AUTOMOD_BLOCK_INVITES || "true").toLowerCase() === "true"
  },
  ticket: {
    maxOpenPerUser: readNumber("MAX_TICKETS_PER_USER", 2, 1, 10),
    closeDelayMs: readNumber("TICKET_CLOSE_DELAY_MS", 5000, 1000, 30000),
    categories: {
      compras: {
        label: "Compras y pedidos",
        emojiId: readId("TICKET_EMOJI_COMPRAS_ID"),
        emojiName: process.env.TICKET_EMOJI_COMPRAS_NAME || "emoji_20",
        emojiKey: "emoji_20",
        description: "Pedidos, productos, pagos, entregas y seguimiento de compras."
      },
      dudas: {
        label: "Dudas y soporte",
        emojiId: readId("TICKET_EMOJI_DUDAS_ID"),
        emojiName: process.env.TICKET_EMOJI_DUDAS_NAME || "emoji_138",
        emojiKey: "emoji_138",
        description: "Resuelve preguntas sobre productos, servicios o cómo comprar."
      },
      reportes: {
        label: "Reportes e incidencias",
        emojiId: readId("TICKET_EMOJI_REPORTES_ID"),
        emojiName: process.env.TICKET_EMOJI_REPORTES_NAME || "emoji_139",
        emojiKey: "emoji_139",
        description: "Comunica problemas, incidencias o situaciones que requieran revisión."
      },
      partner: {
        label: "Partner / Colaboraciones",
        emojiId: readId("TICKET_EMOJI_PARTNER_ID"),
        emojiName: process.env.TICKET_EMOJI_PARTNER_NAME || "flux_pandahiyapolice_2219",
        emojiKey: "flux_pandahiyapolice_2219",
        description: "Presenta propuestas de colaboración y acuerdos con FLUX STORE."
      },
      ally: {
        label: "Alianzas",
        emojiId: readId("TICKET_EMOJI_ALLY_ID"),
        emojiName: process.env.TICKET_EMOJI_ALLY_NAME || "flux_owner_4264",
        emojiKey: "flux_owner_4264",
        description: "Solicita una alianza, promoción o colaboración entre comunidades."
      }
    }
  }
};
