const db = require('../db');

module.exports = (client) => {
  client.on('guildMemberRemove', async (member) => {
    if (member.guild.id !== process.env.GUILD_ID) return;

    try {
      await db.execute(`
        UPDATE users
        SET in_server = 0
        WHERE discord_id = ?
      `, [member.id]);
      console.log(`[EVENT] Member Left: ${member.user.username}`);
    } catch (err) {
      console.error(`[ERROR] memberLeave failed: ${err.message}`);
    }
  });
};