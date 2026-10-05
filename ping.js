const { SlashCommandBuilder } = require("discord.js");
module.exports={data:new SlashCommandBuilder().setName("ping").setDescription("Muestra la latencia."),async execute(i){await i.reply("🏓 Pong! " + (Date.now()-i.createdTimestamp) + "ms | API " + i.client.ws.ping + "ms");}};
