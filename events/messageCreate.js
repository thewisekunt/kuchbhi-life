const db = require('../db');

const cooldown = new Map();
const CHAT_COOLDOWN = 60 * 1000; // 60 seconds

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    // Basic checks to prevent unnecessary DB load
    if (!message.guild || message.author.bot) return;
    if (message.guild.id !== process.env.GUILD_ID) return;

    try {
      // 1. Ensure User exists and update global name/username
      // Using flat queries instead of sub-queries for speed
      await db.execute(`
        INSERT INTO users (discord_id, username, global_name) 
        VALUES (?, ?, ?) 
        ON DUPLICATE KEY UPDATE 
          username = VALUES(username),
          global_name = VALUES(global_name)
      `, [message.author.id, message.author.username, message.author.globalName || message.author.username]);

      // 2. Increment Message Count
      // We use the discord_id directly to find the internal ID
      await db.execute(`
        INSERT INTO user_stats (user_id, message_count)
        VALUES ((SELECT id FROM users WHERE discord_id = ? LIMIT 1), 1)
        ON DUPLICATE KEY UPDATE message_count = message_count + 1
      `, [message.author.id]);

      // 3. Economy Reward with Cooldown
      const now = Date.now();
      const last = cooldown.get(message.author.id);
      
      // Minimum 8 characters to prevent spam/farming
      if (message.content.length >= 8 && (!last || (now - last >= CHAT_COOLDOWN))) {
        const reward = Math.floor(Math.random() * 4) + 2; // ₹2 to ₹5
        
        await db.execute(`
          INSERT INTO economy (user_id, balance, lifetime_earned, updated_at)
          VALUES ((SELECT id FROM users WHERE discord_id = ? LIMIT 1), ?, ?, NOW())
          ON DUPLICATE KEY UPDATE
            balance = balance + VALUES(balance),
            lifetime_earned = lifetime_earned + VALUES(lifetime_earned),
            updated_at = NOW()
        `, [message.author.id, reward, reward]);

        cooldown.set(message.author.id, now);
        
        // Memory management: clean up the map occasionally
        setTimeout(() => cooldown.delete(message.author.id), CHAT_COOLDOWN + 5000);
      }
    } catch (err) {
      // Catch errors so the bot doesn't crash on high-frequency messages
      console.error('❌ DB Error in messageCreate:', err.message);
    }
  });
};