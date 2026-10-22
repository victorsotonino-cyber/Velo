const { Events, EmbedBuilder } = require("discord.js");
const config = require("../config");
const storeService = require("../store-service");
const { welcomeLinksDescription } = require("../utils/welcome");

module.exports = client => {
client.on(Events.GuildMemberAdd, async member => {
  // Autorol de FLUX STORE: configura MEMBER_ROLE_ID en el entorno del bot.
  if (config.roles.member) {
    try {
      await member.roles.add(config.roles.member, "Autorol automático de FLUX STORE");
      console.log("Autorol asignado a " + member.user.tag + " en " + member.guild.name);
    } catch (error) {
      console.error("No se pudo asignar el autorol a " + member.user.tag + ":", error?.message || error);
    }
  }
  const ch = member.guild.channels.cache.get(config.channels.welcome);
  if (ch?.isTextBased()) {
    const embed = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setAuthor({ name: "𝐅𝐋𝐔𝐗 𝐒𝐓𝐎𝐑𝐄" })
      .setTitle("Welcome to FLUX STORE")
      .setDescription(welcomeLinksDescription())
      .setThumbnail(member.displayAvatarURL({ size: 256 }))
      .setFooter({ text: "#" + member.guild.memberCount });

    await ch.send({
      content: member.toString() + " ingresó al servidor!",
      embeds: [embed],
      allowedMentions: { users: [member.id] }
    }).catch(error => console.error("No se pudo enviar la bienvenida:", error));
  }
  await storeService.refreshCounters(member.guild);
});
};
