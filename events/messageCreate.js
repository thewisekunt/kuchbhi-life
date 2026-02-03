const db = require('../db');

const cooldown = new Map();
const CHAT_COOLDOWN = 60 * 1000; // 60s

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;
    if (message.guild.id !== process.env.GUILD_ID) return;

    try {
      // 1. Ensure User Exists & Update Stats (Atomic - no transaction needed)
      // We use pool.execute directly to let the pool handle connection stability
      await db.execute(`
        INSERT INTO users (discord_id, username) 
        VALUES (?, ?) 
        ON DUPLICATE KEY UPDATE username = VALUES(username)
      `, [message.author.id, message.author.username]);

      await db.execute(`
        INSERT INTO user_stats (user_id, message_count)
        VALUES ((SELECT id FROM users WHERE discord_id = ?), 1)
        ON DUPLICATE KEY UPDATE message_count = message_count + 1
      `, [message.author.id]);

      // 2. Economy Reward with Cooldown
      const now = Date.now();
      const last = cooldown.get(message.author.id);
      
      if (message.content.length >= 8 && (!last || (now - last >= CHAT_COOLDOWN))) {
        const reward = Math.floor(Math.random() * 4) + 2; 
        
        await db.execute(`
          INSERT INTO economy (user_id, balance, lifetime_earned, updated_at)
          VALUES ((SELECT id FROM users WHERE discord_id = ?), ?, ?, NOW())
          ON DUPLICATE KEY UPDATE
            balance = balance + VALUES(balance),
            lifetime_earned = lifetime_earned + VALUES(lifetime_earned),
            updated_at = NOW()
        `, [message.author.id, reward, reward]);

        cooldown.set(message.author.id, now);
      }
    } catch (err) {
      // If we get an ECONNRESET here, the pool will automatically try to recreate the connection next time
      console.error('❌ DB Error in messageCreate:', err.message);
    }
  });
};
