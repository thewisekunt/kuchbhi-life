const db = require('../db');

module.exports = (client) => {
  client.once('ready', async () => {
    try {
      const guild = await client.guilds.fetch(process.env.GUILD_ID);
      const members = await guild.members.fetch();

      console.log(`🔄 Bulk Bootstrapping ${members.size} members...`);

      // Prepare the data array for a single bulk query
      const values = [];
      for (const member of members.values()) {
        const roles = member.roles.cache
          .filter(r => r.id !== guild.id)
          .map(r => r.id)
          .join(',');

        // Push an array of values for each member
       // Ensure you match all 7 columns defined in the SQL string
values.push([
  member.id,             // discord_id
  member.user.username,  // username
  member.user.avatar,    // avatar
  1,                     // in_server
  roles,                 // role_snapshot
  new Date(),            // last_seen (NOW() ka equivalent JavaScript mein)
  new Date()             // created_at (NOW() ka equivalent JavaScript mein)
]);
      }

      // 🚀 THE BULK QUERY
      // We use .query() because .execute() doesn't support nested arrays for bulk inserts
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

        // Wrap values in another array for mysql2's bulk syntax: [ [ [row1], [row2] ] ]
        await db.query(sql, [values]);
      }

      console.log('✅ Member bootstrap sync complete (Bulk Success)');

    } catch (err) {
      console.error('❌ Bootstrap sync failed:', err.message);
      // Detailed error logging to see if it's still a connection issue
      if (err.code === 'ECONNRESET') {
        console.error('💡 Pro-tip: Hostinger reset the connection. Bulk insert should fix this.');
      }
    }
  });
};

