const db = require('../db');

module.exports = (client) => {
  client.once('ready', async () => {
    try {
      const guild = await client.guilds.fetch(process.env.GUILD_ID);
      const members = await guild.members.fetch();

      console.log(`🔄 Bulk Bootstrapping ${members.size} members...`);

      const values = [];
      const now = new Date();

      for (const member of members.values()) {
        if (member.user.bot) continue;

        const roles = member.roles.cache
          .filter(r => r.id !== guild.id)
          .map(r => r.id)
          .join(',');

        values.push([
          member.id,             // discord_id
          member.user.username,  // username
          member.user.avatar || 'default', // avatar
          1,                     // in_server
          roles,                 // role_snapshot
          now,                   // last_seen
          now                    // created_at
        ]);
      }

      if (values.length > 0) {
        const sql = `
          INSERT INTO users (
            discord_id, 
            username, 
            avatar, 
            in_server, 
            role_snapshot, 
            last_seen, 
            created_at
          ) 
          VALUES ? 
          ON DUPLICATE KEY UPDATE 
            username = VALUES(username),
            avatar = VALUES(avatar),
            in_server = 1,
            role_snapshot = VALUES(role_snapshot),
            last_seen = NOW()
        `;

        // Bulk inserts must use .query() and triple-nested arrays [[[row1], [row2]]]
        await db.query(sql, [values]);
      }

      console.log('✅ Member bootstrap sync complete (Bulk Success)');
    } catch (err) {
      console.error('❌ Bootstrap sync failed:', err.message);
    }
  });
};