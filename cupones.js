const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("./config");
const coupons = require("./coupon-service");

function isStaff(interaction) {
  const member = interaction.member;
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator) ||
      member.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  const roles = member.roles?.cache;
  return Boolean(roles && (
    (config.roles?.admin && roles.has(config.roles.admin)) ||
    (config.roles?.staff && roles.has(config.roles.staff))
  ));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("cupones")
    .setDescription("Crea, consulta y valida cupones de descuento de FLUX STORE.")
    .addSubcommand(s => s.setName("crear").setDescription("Crea un cupón de descuento para este servidor.")
      .addStringOption(o => o.setName("codigo").setDescription("Código único del cupón").setMinLength(3).setMaxLength(24).setRequired(true))
      .addIntegerOption(o => o.setName("descuento").setDescription("Porcentaje de descuento (1-90)").setMinValue(1).setMaxValue(90).setRequired(true))
      .addIntegerOption(o => o.setName("usos").setDescription("Máximo de usos; 0 significa ilimitado").setMinValue(0).setMaxValue(100000).setRequired(false))
      .addIntegerOption(o => o.setName("dias").setDescription("Días hasta que caduque; 0 significa sin caducidad").setMinValue(0).setMaxValue(3650).setRequired(false)))
    .addSubcommand(s => s.setName("listar").setDescription("Muestra los cupones de este servidor."))
    .addSubcommand(s => s.setName("eliminar").setDescription("Elimina un cupón de este servidor.")
      .addStringOption(o => o.setName("codigo").setDescription("Código del cupón").setMaxLength(24).setRequired(true)))
    .addSubcommand(s => s.setName("validar").setDescription("Comprueba si un cupón sigue vigente.")
      .addStringOption(o => o.setName("codigo").setDescription("Código que quieres comprobar").setMaxLength(24).setRequired(true))),
  async execute(interaction) {
    if (!interaction.guildId) return interaction.reply({ content: "Este comando solo funciona dentro de un servidor.", ephemeral: true });
    const action = interaction.options.getSubcommand();
    const code = coupons.normalizeCode(interaction.options.getString("codigo") || "");

    if (action === "validar") {
      const result = coupons.validateCoupon(interaction.guildId, code);
      if (!result.ok) return interaction.reply({ content: "❌ " + result.reason, ephemeral: true, allowedMentions: { parse: [] } });
      const coupon = result.coupon;
      const maxUses = Number(coupon.maxUses) || 0;
      const uses = Math.max(0, Number(coupon.uses) || 0);
      const usage = maxUses > 0 ? uses + "/" + maxUses : uses + "/ilimitado";
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.success)
          .setTitle("✅ Cupón válido")
          .setDescription("Código: **" + coupon.code + "**\nDescuento: **" + coupon.discount + "%**\nUsos: **" + usage + "**" +
            (coupon.expiresAt ? "\nCaduca: <t:" + Math.floor(Date.parse(coupon.expiresAt) / 1000) + ":R>" : "\nCaducidad: **Sin fecha límite**"))
          .setFooter({ text: "La validación no registra un uso ni confirma un pago. El descuento se fija en el carrito." })],
        ephemeral: true,
        allowedMentions: { parse: [] }
      });
    }

    if (!isStaff(interaction)) {
      return interaction.reply({ content: "❌ Solo el personal autorizado puede administrar cupones.", ephemeral: true });
    }

    const rows = coupons.readCoupons();
    if (action === "crear") {
      if (!/^[A-Z0-9_-]{3,24}$/.test(code)) {
        return interaction.reply({ content: "Usa entre 3 y 24 caracteres: letras, números, guion o guion bajo.", ephemeral: true });
      }
      if (rows.some(item => coupons.normalizeCode(item.code) === code &&
          (!item.guildId || item.guildId === interaction.guildId))) {
        return interaction.reply({ content: "❌ Ese código ya existe en este servidor. Elige otro.", ephemeral: true });
      }
      const discount = interaction.options.getInteger("descuento");
      const maxUses = interaction.options.getInteger("usos") ?? 0;
      const days = interaction.options.getInteger("dias") ?? 0;
      const now = new Date();
      const coupon = {
        guildId: interaction.guildId,
        code,
        discount,
        maxUses,
        uses: 0,
        redemptions: [],
        createdBy: interaction.user.id,
        createdAt: now.toISOString(),
        expiresAt: days > 0 ? new Date(now.getTime() + days * 86400000).toISOString() : null
      };
      rows.push(coupon);
      coupons.writeCoupons(rows);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle("🎟️ Cupón creado")
          .setDescription("Código: **" + code + "**\nDescuento: **" + discount + "%**\nUsos máximos: **" + (maxUses || "Ilimitados") + "**\nCaducidad: **" + (days ? days + " días" : "Sin caducidad") + "**")
          .setFooter({ text: "El uso se registra cuando el personal verifica el pago del pedido." })],
        ephemeral: true,
        allowedMentions: { parse: [] }
      });
    }

    if (action === "listar") {
      const visible = coupons.listCouponsForGuild(interaction.guildId);
      if (!visible.length) return interaction.reply({ content: "No hay cupones registrados para este servidor.", ephemeral: true });
      const description = visible.slice(-25).reverse().map(coupon => {
        const status = coupons.couponStatus(coupon);
        const label = status === "active" ? "🟢 Activo" : status === "expired" ? "🔴 Caducado" : "🟠 Agotado";
        const maxUses = Number(coupon.maxUses) || 0;
        const uses = Math.max(0, Number(coupon.uses) || 0);
        return "**" + coupon.code + "** — " + coupon.discount + "% · " + label + " · Usos: " + (maxUses > 0 ? uses + "/" + maxUses : uses + "/∞");
      }).join("\n");
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle("🎟️ Cupones de FLUX STORE")
          .setDescription(description.slice(0, 4000)).setFooter({ text: "Mostrando hasta 25 cupones recientes." })],
        ephemeral: true,
        allowedMentions: { parse: [] }
      });
    }

    const index = rows.findIndex(item => coupons.normalizeCode(item.code) === code &&
      (!item.guildId || item.guildId === interaction.guildId));
    if (index < 0) return interaction.reply({ content: "❌ No encontré ese cupón en este servidor.", ephemeral: true });
    rows.splice(index, 1);
    coupons.writeCoupons(rows);
    return interaction.reply({ content: "✅ Cupón **" + code + "** eliminado.", ephemeral: true, allowedMentions: { parse: [] } });
  }
};
