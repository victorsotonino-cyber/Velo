const { SlashCommandBuilder,EmbedBuilder,ActionRowBuilder,StringSelectMenuBuilder }=require("discord.js"); const config=require("./config");
module.exports={data:new SlashCommandBuilder().setName("help").setDescription("Muestra la ayuda."),async execute(i){
const menu=new StringSelectMenuBuilder().setCustomId("help_category").setPlaceholder("Selecciona una categoría").addOptions(
{label:"Utilidad",value:"utilidad",emoji:"🧰"},{label:"Moderación",value:"moderacion",emoji:"🛡️"},{label:"Tickets",value:"tickets",emoji:"🎫"},{label:"Servidor",value:"servidor",emoji:"🏠"},{label:"Diversión",value:"diversion",emoji:"🎮"},{label:"Configuración",value:"configuracion",emoji:"⚙️"});
await i.reply({embeds:[new EmbedBuilder().setColor(config.colors.primary).setTitle("📚 Velo Studio — Ayuda").setDescription("Elige una categoría:")],components:[new ActionRowBuilder().addComponents(menu)]});
}};
