const db = require('../db');

module.exports = (client) => {
  client.on('guildMemberAdd', async (member) => {
    if (member.guild.id !== process.env.GUILD_ID) return;

    await db.execute(`
      INSERT IGNORE INTO users (discord_id, username, avatar, joined_at, in_server)
      VALUES (?, ?, ?, NOW(), 1)
    `, [
      member.id,
      member.user.username,
      member.user.avatar
    ]);
  });
};
