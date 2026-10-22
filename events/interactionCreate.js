const { Events } = require("discord.js");
const config = require("../config");
const { emoji } = require("../ui");

module.exports = client => {
client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    try {
      if (typeof command?.autocomplete === "function") return await command.autocomplete(interaction, client);
      return await interaction.respond([]);
    } catch (error) {
      console.error("Error en autocompletado de /" + interaction.commandName + ":", error);
      return interaction.respond([]).catch(() => {});
    }
  }
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) {
    return interaction.reply({
      content: emoji(interaction.guild, "error", "❌") + " Ese comando ya no está disponible. Reinicia el registro de comandos.",
      ephemeral: true
    }).catch(() => {});
  }
  try { await command.execute(interaction, client); }
  catch (e) {
    console.error("Error en /" + interaction.commandName + ":", e);
    const msg = { content: emoji(interaction.guild, "error", "❌") + " Error en /" + interaction.commandName + ". Revisa los permisos del bot y vuelve a intentarlo.", ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(msg).catch(() => {});
    else await interaction.reply(msg).catch(() => {});
  }
});
};
