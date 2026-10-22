const { Events } = require("discord.js");
const config = require("../config");
const { emoji } = require("../ui");
const storeService = require("../store-service");

module.exports = client => {
client.on(Events.GuildMemberRemove, async member => {
  const ch = member.guild.channels.cache.get(config.channels.welcome);
  if (ch?.isTextBased()) await ch.send(emoji(member.guild, "info", "👋") + " **" + (member.user?.tag || "Un miembro") + "** ha salido de Flux Store.").catch(() => {});
  await storeService.refreshCounters(member.guild);
});
};
