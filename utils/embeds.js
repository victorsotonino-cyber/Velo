const { EmbedBuilder } = require('discord.js');
const config = require('../config');

const base = (color) => new EmbedBuilder().setColor(color).setTimestamp();

module.exports = {
  primary: (opts = {}) => {
    const e = base(opts.color ?? config.colors.primary);
    if (opts.title) e.setTitle(opts.title);
    if (opts.description) e.setDescription(opts.description);
    return e;
  },
  success: (d) => base(config.colors.success).setDescription(`✅ ${d}`),
  error:   (d) => base(config.colors.error).setDescription(`❌ ${d}`),
  warn:    (d) => base(config.colors.warning).setDescription(`⚠️ ${d}`),
  info:    (d) => base(config.colors.info).setDescription(`ℹ️ ${d}`)
};
