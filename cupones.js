const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const config = require("./config");
const { readJSON, writeJSON } = require("./storage");

const FILE = "flux-store-coupons.json";

function readCoupons() {
  const data = readJSON(FILE, []);
  return Array.isArray(data) ? data : [];
}

function belongsToGuild(coupon, guildId) {
  return !coupon.guildId || coupon.guildId === guildId;
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
  return String(value || "").trim().toUpperCase().replace(/\s+/g, "");
}

function couponStatus(coupon) {
  const expiry = coupon.expiresAt ? Date.parse(coupon.expiresAt) : null;
  if (coupon.expiresAt && (!Number.isFinite(expiry) || Date.now() >= expiry)) return "expired";
  const maxUses = Math.max(0, Number(coupon.maxUses) || 0);
  const uses = Math.max(0, Number(coupon.uses) || 0);
  if (maxUses > 0 && uses >= maxUses) return "exhausted";
  return "active";
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("cupones")
    .setDescription("Administra y valida cupones de descuento de FLUX STORE.")
    .addSubcommand(sub => sub.setName("crear").setDescription("Crea un cupón de descuento.")
      .addStringOption(option => option.setName("codigo").setDescription("Código único del cupón").setMinLength(3).setMaxLength(24).setRequired(true))
      .addIntegerOption(option => option.setName("descuento").setDescription("Porcentaje de descuento (1-90)").setMinValue(1).setMaxValue(90).setRequired(true))
      .addIntegerOption(option => option.setName("usos").setDescription("Máximo de usos; 0 significa ilimitado").setMinValue(0).setMaxValue(100000).setRequired(false))
      .addIntegerOption(option => option.setName("dias").setDescription("Días hasta caducar; 0 significa sin caducidad").setMinValue(0).setMaxValue(3650).setRequired(false))
      .addStringOption(option => option.setName("descripcion").setDescription("Uso o campaña del cupón").setMaxLength(200).setRequired(false)))
    .addSubcommand(sub => sub.setName("listar").setDescription("Muestra los cupones de este servidor."))
    .addSubcommand(sub => sub.setName("eliminar").setDescription("Elimina un cupón.")
      .addStringOption(option => option.setName("codigo").setDescription("Código del cupón").setMaxLength(24).setRequired(true)))
    .addSubcommand(sub => sub.setName("validar").setDescription("Comprueba si un cupón sigue vigente.")
      .addStringOption(option => option.setName("codigo").setDescription("Código que quieres comprobar").setMaxLength(24).setRequired(true))),
  async execute(interaction) {
    const action = interaction.options.getSubcommand();
    const coupons = readCoupons();
    const visibleCoupons = coupons.filter(coupon => belongsToGuild(coupon, interaction.guildId));

    if (action === "validar") {
      const code = normalizeCode(interaction.options.getString("codigo"));
      const coupon = visibleCoupons.find(item => normalizeCode(item.code) === code);
      if (!coupon) return interaction.reply({ content: "❌ Ese cupón no existe en este servidor.", ephemeral: true });
      const status = couponStatus(coupon);
      if (status !== "active") {
        return interaction.reply({
          content: status === "expired" ? "❌ El cupón ha caducado." : "❌ El cupón alcanzó su límite de usos.",
          ephemeral: true
        });
      }
      const usage = Number(coupon.maxUses) > 0 ? (Number(coupon.uses) || 0) + "/" + coupon.maxUses : (Number(coupon.uses) || 0) + "/ilimitado";
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.success)
          .setTitle("✅ Cupón válido")
          .setDescription("Código: **" + code + "**\nDescuento: **" + coupon.discount + "%**\nUsos: **" + usage + "**" +
            (coupon.expiresAt ? "\nCaduca: <t:" + Math.floor(Date.parse(coupon.expiresAt) / 1000) + ":R>" : "\nCaducidad: **Sin fecha límite**") +
            (coupon.description ? "\nDescripción: " + String(coupon.description).slice(0, 300) : ""))
          .setFooter({ text: "El descuento se aplica al crear un pedido válido con /pedido crear." })],
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
      if (visibleCoupons.some(item => normalizeCode(item.code) === code)) {
        return interaction.reply({ content: "❌ Ya existe ese código en este servidor. Elige otro.", ephemeral: true });
      }
      const discount = interaction.options.getInteger("descuento");
      const maxUses = interaction.options.getInteger("usos") ?? 0;
      const days = interaction.options.getInteger("dias") ?? 0;
      const coupon = {
        guildId: interaction.guildId,
        code,
        discount,
        maxUses,
        uses: 0,
        description: interaction.options.getString("descripcion")?.trim() || "",
        redemptions: [],
        createdBy: interaction.user.id,
        createdAt: new Date().toISOString(),
        expiresAt: days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : null
      };
      coupons.push(coupon);
      writeJSON(FILE, coupons);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.success).setTitle("🎟️ Cupón creado")
          .setDescription("Código: **" + code + "**\nDescuento: **" + discount + "%**\nUsos máximos: **" + (maxUses || "Ilimitados") + "**\nCaducidad: **" + (days ? days + " días" : "Sin caducidad") + "**" +
            (coupon.description ? "\nDescripción: " + coupon.description : ""))
          .setFooter({ text: "FLUX STORE • Se consume al crear un pedido; una cancelación libera el uso." })],
        ephemeral: true
      });
    }

    if (action === "listar") {
      if (!visibleCoupons.length) return interaction.reply({ content: "No hay cupones registrados en este servidor.", ephemeral: true });
      const description = visibleCoupons.slice(-25).reverse().map(coupon => {
        const status = couponStatus(coupon);
        const statusText = status === "active" ? "🟢 Activo" : status === "expired" ? "🔴 Caducado" : "🟠 Agotado";
        const uses = Number(coupon.maxUses) > 0 ? (Number(coupon.uses) || 0) + "/" + coupon.maxUses : (Number(coupon.uses) || 0) + "/∞";
        return "**" + coupon.code + "** — " + coupon.discount + "% · " + statusText + " · Usos: " + uses +
          (coupon.description ? "\n_" + String(coupon.description).slice(0, 120) + "_" : "");
      }).join("\n").slice(0, 4000);
      return interaction.reply({
        embeds: [new EmbedBuilder().setColor(config.colors.primary).setTitle("🎟️ Cupones de FLUX STORE")
          .setDescription(description).setFooter({ text: "Mostrando hasta 25 cupones recientes." })],
        ephemeral: true
      });
    }

    const code = normalizeCode(interaction.options.getString("codigo"));
    const index = coupons.findIndex(item => normalizeCode(item.code) === code && belongsToGuild(item, interaction.guildId));
    if (index < 0) return interaction.reply({ content: "❌ No encontré ese cupón en este servidor.", ephemeral: true });
    coupons.splice(index, 1);
    writeJSON(FILE, coupons);
    return interaction.reply({ content: "✅ Cupón **" + code + "** eliminado.", ephemeral: true });
  }
};
