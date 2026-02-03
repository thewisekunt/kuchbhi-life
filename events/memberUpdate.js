const db = require('../db');

module.exports = (client) => {
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (newMember.guild.id !== process.env.GUILD_ID) return;

    try {
      const roles = newMember.roles.cache.map(r => r.id).join(',');

      await db.execute(`
        UPDATE users
        SET role_snapshot = ?, last_seen = NOW()
        WHERE discord_id = ?
      `, [roles, newMember.id]);
    } catch (err) {
      console.error(`[ERROR] memberUpdate failed: ${err.message}`);
    }
  });
};