const { Events, ActivityType, REST, Routes } = require("discord.js");
const config = require("../config");
const giveawayService = require("../giveaway-service");

module.exports = client => {
async function registerCommands() {
  if (!config.clientId || !config.guildId) {
    console.warn("CLIENT_ID/GUILD_ID no configurados; no se registrarán comandos.");
    return;
  }
  const body = [...client.commands.values()].map(c => c.data.toJSON());
  const rest = new REST({ version: "10" }).setToken(config.token);
  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body });
  console.log("Comandos slash registrados:", body.length);
}

client.once(Events.ClientReady, async c => {
  console.log(c.user.tag + " está online.");
  c.user.setPresence({
    activities: [{ name: "Flux STORE • /help | !help", type: ActivityType.Watching }],
    status: "online"
  });
  try { giveawayService.restore(c); }
  catch (e) { console.error("Error restaurando sorteos:", e); }
  try { await registerCommands(); }
  catch (e) { console.error("Error registrando comandos:", e); }
});
};
