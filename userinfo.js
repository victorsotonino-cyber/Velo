const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Muestra información pública de un miembro del servidor.")
    .addUserOption(o => o.setName("usuario").setDescription("Usuario que quieres consultar").setRequired(false)),
  async execute(i) {
    if (!i.guild) return i.reply({ content: "Este comando solo funciona dentro de un servidor.", ephemeral: true });
    const user = i.options.getUser("usuario") || i.user;
    const member = await i.guild.members.fetch(user.id).catch(() => null);
    const roles = member
      ? member.roles.cache.filter(role => role.id !== i.guild.id).sort((a, b) => b.position - a.position).map(role => role.toString()).slice(0, 20)
      : [];
    const createdAt = Number.isFinite(user.createdTimestamp) ? "<t:" + Math.floor(user.createdTimestamp / 1000) + ":F>" : "No disponible";
    const joinedAt = member?.joinedTimestamp ? "<t:" + Math.floor(member.joinedTimestamp / 1000) + ":F>" : "No es miembro o no está disponible";
    const embed = new EmbedBuilder().setColor(config.colors.primary).setTitle("Información de usuario · " + user.tag)
      .setThumbnail(user.displayAvatarURL({ size: 512 }))
      .addFields(
        { name: "ID", value: user.id, inline: true },
        { name: "Cuenta bot", value: user.bot ? "Sí" : "No", inline: true },
        { name: "Cuenta creada", value: createdAt, inline: false },
        { name: "Se unió al servidor", value: joinedAt, inline: false },
        { name: "Roles", value: roles.length ? roles.join(" ").slice(0, 1024) : "Sin roles adicionales o usuario fuera del servidor.", inline: false }
      )
      .setFooter({ text: "FLUX STORE • Información visible en Discord" });
    if (member?.premiumSinceTimestamp) embed.addFields({ name: "Server boost", value: "<t:" + Math.floor(member.premiumSinceTimestamp / 1000) + ":D>", inline: true });
    return i.reply({ embeds: [embed], ephemeral: true, allowedMentions: { parse: [] } });
  }
};
