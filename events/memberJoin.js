const db = require('../db');

module.exports = (client) => {
  client.on('guildMemberAdd', async (member) => {
    // Only track members for the specific server defined in .env
    if (member.guild.id !== process.env.GUILD_ID) return;

    try {
      await db.execute(`
        INSERT INTO users (discord_id, username, avatar, joined_at, in_server)
        VALUES (?, ?, ?, NOW(), 1)
        ON DUPLICATE KEY UPDATE 
          username = VALUES(username),
          avatar = VALUES(avatar),
          in_server = 1
      `, [
        member.id,
        member.user.username,
        member.user.avatar || 'default'
      ]);
      console.log(`[EVENT] Member Joined: ${member.user.username}`);
    } catch (err) {
      console.error(`[ERROR] memberJoin failed: ${err.message}`);
    }
  });
};