const db = require('../db');
const ensureUser = require('../utils/ensureUser');

module.exports = (client) => {
  client.once('ready', async () => {
    try {
      const guild = await client.guilds.fetch(process.env.GUILD_ID);
      const members = await guild.members.fetch();

      console.log(`🔄 Bootstrapping ${members.size} members…`);

      const values = [];
      const now = new Date();

      for (const member of members.values()) {
        if (member.user.bot) continue;

        // Ensure base user + economy row
        await ensureUser(member.user);

        const roles = member.roles.cache
          .filter(r => r.id !== guild.id) // remove @everyone
          .map(r => r.id)
          .sort()
          .join(',');

        values.push([
          member.id,                    // discord_id
          member.user.username,         // username
          member.user.avatar || null,   // avatar
          1,                            // in_server
          roles,                        // role_snapshot
          now                           // last_seen
        ]);
      }

      if (values.length === 0) {
        console.log('ℹ️ No members to sync.');
        return;
      }

      await db.query(
        `
        INSERT INTO users (
          discord_id,
          username,
          avatar,
          in_server,
          role_snapshot,
          last_seen
        )
        VALUES ?
        ON DUPLICATE KEY UPDATE
          username = VALUES(username),
          avatar = VALUES(avatar),
          in_server = 1,
          role_snapshot = VALUES(role_snapshot),
          last_seen = VALUES(last_seen)
        `,
        [values]
      );

      console.log('✅ Startup member sync complete');

    } catch (err) {
      console.error('❌ syncOnReady Error:', err);
    }
  });
};
