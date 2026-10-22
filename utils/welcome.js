const config = require("../config");

function welcomeLinksDescription() {
  const links = [
    ["TERMINOS", config.channels.terms],
    ["METODOS", config.channels.paymentMethods],
    ["TICKETS", config.channels.ticketInfo]
  ];
  const lines = links
    .filter(([, id]) => /^\d{17,20}$/.test(String(id || "")))
    .map(([label, id]) => "• • <#" + id + "> **" + label + "**");
  return lines.length
    ? lines.join("\n")
    : "Configura TERMS_CHANNEL_ID, PAYMENT_METHODS_CHANNEL_ID y TICKETS_INFO_CHANNEL_ID en el entorno del bot.";
}

module.exports = { welcomeLinksDescription };
