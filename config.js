require("dotenv").config();

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Falta la variable de entorno obligatoria: ${name}`);
  return value;
}

module.exports = {
  token: process.env.DISCORD_TOKEN || "",
  clientId: process.env.CLIENT_ID || "",
  guildId: process.env.GUILD_ID || "",
  prefix: process.env.BOT_PREFIX || "!",
  name: "DATASHOP",
  port: Number(process.env.PORT) || 3000,
  required
};
