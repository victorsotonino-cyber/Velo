"use strict";
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
module.exports = {
  data: new SlashCommandBuilder().setName("banner").setDescription("Muestra el banner de perfil de un usuario si está disponible.")
    .addUserOption(o => o.setName("usuario").setDescription("Usuario cuyo banner quieres ver; por defecto tú").setRequired(false)),
  async execute(i) {
    const selected = i.options.getUser("usuario") || i.user;
    await i.deferReply({ ephemeral: true });
    const user = await i.client.users.fetch(selected.id, { force: true }).catch(() => selected);
    const bannerURL = typeof user.bannerURL === "function" ? user.bannerURL({ size: 1024 }) : null;
    if (!bannerURL) return i.editReply({ content: "Ese usuario no tiene un banner disponible o Discord no lo devolvió." });
    const embed = new EmbedBuilder().setColor(config.colors.primary || 0x8B5CF6)
      .setTitle("Banner de " + user.tag).setImage(bannerURL)
      .setFooter({ text: "FLUX STORE • Perfil público de Discord" });
    return i.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
