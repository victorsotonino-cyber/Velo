const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("./config");
const { readJSON, writeJSON } = require("./storage");

const FILE = "flux-store-coupons.json";

function readCoupons() {
  const data = readJSON(FILE, []);
  return Array.isArray(data) ? data : [];
}

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

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase().replace(/\\s+/g, "");
}

function couponStatus(coupon) {
  if (coupon.expiresAt && Date.now() >= Date.parse(coupon.expiresAt)) return "expired";
  if (Number.isFinite(coupon.maxUses) && coupon.maxUses > 0 && coupon.uses >= coupon.maxUses) return "exhausted";
  return "active";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("cupones")
    .setDescription("Administra y valida cupones de descuento de FLUX STORE.")
    .addSubcommand(s => s.setName("crear").setDescription("Crea un cupón de descuento.")
      .addStringOption(o => o.setName("codigo").setDescription("Código único del cupón").setMinLength(3).setMaxLength(24).setRequired(true))
      .addIntegerOption(o => o.setName("descuento").setDescription("Porcentaje de descuento (1-90)").setMinValue(1).setMaxValue(90).setRequired(true))
      .addIntegerOption(o => o.setName("usos").setDescription("Máximo de usos; 0 significa ilimitado").setMinValue(0).setMaxValue(100000).setRequired(false))
      .addIntegerOption(o => o.setName("dias").setDescription("Días hasta que caduque; 0 significa sin caducidad").setMinValue(0).setMaxValue(3650).setRequired(false)))
    .addSubcommand(s => s.setName("listar").setDescription("Muestra los cupones registrados."))
    .addSubcommand(s => s.setName("eliminar").setDescription("Elimina un cupón.")
      .addStringOption(o => o.setName("codigo").setDescription("Código del cupón").setMaxLength(24).setRequired(true)))
    .addSubcommand(s => s.setName("validar").setDescription("Comprueba si un cupón sigue vigente.")
      .addStringOption(o => o.setName("codigo").setDescription("Código que quieres comprobar").setMaxLength(24).setRequired(true))),
  async execute(interaction) {
    const action = interaction.options.getSubcommand();
    const coupons = readCoupons();

    if (action === "validar") {
      const code = normalizeCode(interaction.options.getString("codigo"));
      const coupon = coupons.find(item => item.code === code);
      if (!coupon) return interaction.reply({ content: "❌ Ese cupón no existe.", ephemeral: true });
      const status = couponStatus(coupon);
      if (status !== "active") {
        const reason = status === "expired" ? "ha caducado" : "alcanzó su límite de usos";
        return interaction.reply({ content: "❌ El cupón **" + code + "** " + reason + ".", ephemeral: true });
      }
      const usage = coupon.maxUses > 0 ? coupon.uses + "/" + coupon.maxUses : coupon.uses + "/ilimitado";
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.success)
          .setTitle("✅ Cupón válido")
          .setDescription("Código: **" + code + "**\nDescuento: **" + coupon.discount + "%**\nUsos: **" + usage + "**" +
            (coupon.expiresAt ? "\nCaduca: <t:" + Math.floor(Date.parse(coupon.expiresAt) / 1000) + ":R>" : "\nCaducidad: **Sin fecha límite**"))
          .setFooter({ text: "FLUX STORE • La validez no confirma un pago ni aplica automáticamente el descuento." })],
        ephemeral: true
      });
    }

    if (!isStaff(interaction)) {
      return interaction.reply({ content: "❌ Solo el personal autorizado puede administrar cupones.", ephemeral: true });
    }

    if (action === "crear") {
      const code = normalizeCode(interaction.options.getString("codigo"));
      if (!/^[A-Z0-9_-]{3,24}$/.test(code)) {
        return interaction.reply({ content: "❌ Usa entre 3 y 24 caracteres: letras, números, guion o guion bajo.", ephemeral: true });
      }
      if (coupons.some(item => item.code === code)) {
        return interaction.reply({ content: "❌ Ya existe ese código. Elige otro.", ephemeral: true });
      }
      const discount = interaction.options.getInteger("descuento");
      const maxUses = interaction.options.getInteger("usos") ?? 0;
      const days = interaction.options.getInteger("dias") ?? 0;
      const coupon = {
        code,
        discount,
        maxUses,
        uses: 0,
        createdBy: interaction.user.id,
        createdAt: new Date().toISOString(),
        expiresAt: days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null
      };
      coupons.push(coupon);
      writeJSON(FILE, coupons);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle("🎟️ Cupón creado")
          .setDescription("Código: **" + code + "**\nDescuento: **" + discount + "%**\nUsos máximos: **" + (maxUses || "Ilimitados") + "**\nCaducidad: **" + (days ? days + " días" : "Sin caducidad") + "**")
          .setFooter({ text: "FLUX STORE • La aplicación del descuento debe verificarse al confirmar el pedido." })],
        ephemeral: true
      });
    }

    if (action === "listar") {
      if (!coupons.length) return interaction.reply({ content: "No hay cupones registrados.", ephemeral: true });
      const description = coupons.slice(-25).reverse().map(coupon => {
        const status = couponStatus(coupon);
        const statusText = status === "active" ? "🟢 Activo" : status === "expired" ? "🔴 Caducado" : "🟠 Agotado";
        const uses = coupon.maxUses > 0 ? coupon.uses + "/" + coupon.maxUses : coupon.uses + "/∞";
        return "**" + coupon.code + "** — " + coupon.discount + "% · " + statusText + " · Usos: " + uses;
      }).join("\n");
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle("🎟️ Cupones de FLUX STORE")
          .setDescription(description).setFooter({ text: "Mostrando hasta 25 cupones recientes." })],
        ephemeral: true
      });
    }

    const code = normalizeCode(interaction.options.getString("codigo"));
    const index = coupons.findIndex(item => item.code === code);
    if (index < 0) return interaction.reply({ content: "❌ No encontré ese cupón.", ephemeral: true });
    coupons.splice(index, 1);
    writeJSON(FILE, coupons);
    return interaction.reply({ content: "✅ Cupón **" + code + "** eliminado.", ephemeral: true });
  }
};
