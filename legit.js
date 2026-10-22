const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require("discord.js");
const config = require("./config");
const store = require("./store-service");
module.exports = {
  data: new SlashCommandBuilder().setName("legit").setDescription("Publica el panel de verificación de confianza de Flux STORE.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  async execute(i) {
    const stats = store.getStats();
    const embed = new EmbedBuilder().setColor(config.colors.primary)
      .setTitle("✦ ᴇs ғʟᴜx sᴛᴏʀᴇ ʟᴇɢɪᴛ? ✦")
      .setDescription("Si tu experiencia con la tienda fue positiva, confirma abajo. Cada persona cuenta una sola vez.\n\n✅ **ᴘᴇʀsᴏɴᴀs ǫᴜᴇ ᴠᴇʀɪғɪᴄᴀʀᴏɴ ǫᴜᴇ sᴏᴍᴏs ʟᴇɢɪᴛ:** **" + stats.legit + "**")
      .setThumbnail(i.guild.iconURL({ size: 256 })).setFooter({ text: "Flux STORE • Las respuestas se pueden actualizar" }).setTimestamp();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("flux_legit_yes").setLabel("Sí").setEmoji("✅").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("flux_legit_no").setLabel("No").setEmoji("❌").setStyle(ButtonStyle.Danger)
    );
    return i.reply({ embeds: [embed], components: [row] });
  }
};
