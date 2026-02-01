const db = require('../db');

module.exports = (client) => {
  client.once('ready', async () => {
    try {
      const guild = await client.guilds.fetch(process.env.GUILD_ID);

      // IMPORTANT: fetch all members
      const members = await guild.members.fetch();

      console.log(`🔄 Bootstrapping ${members.size} members...`);

      for (const member of members.values()) {
        const roles = member.roles.cache
          .filter(r => r.id !== guild.id) // remove @everyone
          .map(r => r.id)
          .join(',');

        // 1️⃣ Ensure user exists
        await db.execute(`
          INSERT INTO users (
            discord_id,
            username,
            avatar,
            in_server,
            role_snapshot,
            last_seen,
            created_at
          )
          VALUES (?, ?, ?, 1, ?, NOW(), NOW())
          ON DUPLICATE KEY UPDATE
            username = VALUES(username),
            avatar = VALUES(avatar),
            in_server = 1,
            role_snapshot = VALUES(role_snapshot),
            last_seen = NOW()
        `, [
          member.id,
          member.user.username,
          member.user.avatar,
          roles
        ]);
      }

      console.log('✅ Member bootstrap sync complete');

    } catch (err) {
      console.error('❌ Bootstrap sync failed:', err);
    }
  });
};
