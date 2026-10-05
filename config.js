require("dotenv").config();
module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  colors: { primary: 0xE11D2E, dark: 0x111111, success: 0x22C55E, warning: 0xF59E0B, error: 0xEF4444 },
  channels: { welcome: "1550131491588014180", logs: "1550131492578132010", tickets: "1554962090295562240", announcements: "1550131491588014181" },
  roles: { admin: "1550131491151945778", staff: "1552119717597028515", member: "1550131491080507477" }
};
