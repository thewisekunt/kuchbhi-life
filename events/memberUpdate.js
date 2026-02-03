const db = require('../db');
const ensureUser = require('../utils/ensureUser');

module.exports = (client) => {
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (newMember.guild.id !== process.env.GUILD_ID) return;

    try {
      // Ensure base user exists
      if (newMember.user) {
        await ensureUser(newMember.user);
      }

      // Build role snapshot (sorted for stability)
      const roles = newMember.roles.cache
        .map(r => r.id)
        .sort()
        .join(',');

      // Only update if roles actually changed
      const oldRoles = oldMember.roles.cache
        .map(r => r.id)
        .sort()
        .join(',');

      if (roles === oldRoles) return;

      await db.execute(
        `
        UPDATE users
        SET
          role_snapshot = ?,
          last_seen = NOW()
        WHERE discord_id = ?
        `,
        [roles, newMember.id]
      );

    } catch (err) {
      console.error(
        '❌ memberUpdate Error:',
        err
      );
    }
  });
};
