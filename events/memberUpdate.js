const db = require('../db');

module.exports = (client) => {
  client.on('guildMemberUpdate', async (_, member) => {
    if (member.guild.id !== process.env.GUILD_ID) return;

    const roles = member.roles.cache.map(r => r.id).join(',');

    await db.execute(`
      UPDATE users
      SET role_snapshot = ?, last_seen = NOW()
      WHERE discord_id = ?
    `, [roles, member.id]);
  });
};
