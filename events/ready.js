module.exports = (client) => {
  client.once('ready', () => {
    console.log(`🔥 Bot is ready! Logged in as: ${client.user.tag}`);
  });
};