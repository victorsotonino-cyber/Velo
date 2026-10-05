const { ActivityType } = require('discord.js');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`🤖 ${client.user.tag} online.`);
    client.user.setPresence({
      activities: [{ name: 'todos los chats 👀 | /help', type: ActivityType.Watching }],
      status: 'online'
    });
  }
};
