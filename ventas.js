const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const config = require("./config");
const store = require("./store-service");
module.exports = {
  data: new SlashCommandBuilder()
    .setName("ventas")
    .setDescription("Consulta y administra el contador de ventas de Flux STORE.")
    .addSubcommand(s => s.setName("ver").setDescription("Muestra el total de ventas registrado."))
    .addSubcommand(s => s.setName("sumar").setDescription("Añade ventas al contador.")
      .addIntegerOption(o => o.setName("cantidad").setDescription("Cantidad que quieres añadir, por defecto 1.").setMinValue(1).setMaxValue(10000).setRequired(false)))
    .addSubcommand(s => s.setName("establecer").setDescription("Cambia el contador al total correcto.")
      .addIntegerOption(o => o.setName("cantidad").setDescription("Nuevo total de ventas").setMinValue(0).setMaxValue(100000000).setRequired(true))),
  async execute(i) {
    const action = i.options.getSubcommand();
    if (action === "ver") {
      const stats = store.getStats();
      const embed = new EmbedBuilder().setColor(config.colors.primary)
        .setTitle("✦ ʀᴇsᴜᴍᴇɴ ᴅᴇ ғʟᴜx sᴛᴏʀᴇ ✦")
        .setDescription("🛒 **ᴠᴇɴᴛᴀs ʀᴇɢɪsᴛʀᴀᴅᴀs:** **" + stats.sales + "**\n✅ **ᴠᴇʀɪғɪᴄᴀᴄɪᴏɴᴇs ʟᴇɢɪᴛ:** **" + stats.legit + "**")
        .setFooter({ text: "Flux STORE • Contadores de la tienda" });
      return i.reply({ embeds: [embed], ephemeral: true });
    }
    if (!store.isStoreStaff(i.member)) return i.reply({ content: "❌ Solo Owner/Manager/Staff autorizado puede modificar las ventas.", ephemeral: true });
    const stats = action === "sumar" ? store.addSales(i.options.getInteger("cantidad") || 1) : store.setSales(i.options.getInteger("cantidad"));
    await store.refreshCounters(i.guild);
    return i.reply({ content: "✅ Contador actualizado: **" + stats.sales + " ventas**.", ephemeral: true });
  }
};
