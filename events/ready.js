module.exports = (client) => {
  client.once('ready', () => {
    console.log(`🔥 Kuch Bhi bot online as ${client.user.tag}`);
  });
};
