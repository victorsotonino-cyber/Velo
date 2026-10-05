const {SlashCommandBuilder,PermissionFlagsBits}=require("discord.js");
const config=require("./config");
module.exports={data:new SlashCommandBuilder().setName("ticket-config").setDescription("Muestra la configuración de tickets.").setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),async execute(i){const c=i.guild.channels.cache.get(config.channels.tickets);const r=i.guild.roles.cache.get(config.roles.staff);await i.reply({ephemeral:true,content:`🎫 **Configuración**\n📂 Categoría base: ${c||"No encontrada"}\n👥 Staff: ${r||"No encontrado"}`});}};
