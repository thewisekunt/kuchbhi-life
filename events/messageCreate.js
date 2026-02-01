const db = require('../db');

const cooldown = new Map();
const CHAT_COOLDOWN = 60 * 1000; // 60s

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    // Basic Filters
    if (!message.guild || message.author.bot) return;
    if (message.guild.id !== process.env.GUILD_ID) return;

    let connection; // Declare outside to use in catch/finally

    try {
      connection = await db.getConnection();
      await connection.beginTransaction();

      // --- 1. ALWAYS ENSURE USER EXISTS ---
      await connection.execute(`
        INSERT INTO users (discord_id, username) 
        VALUES (?, ?) 
        ON DUPLICATE KEY UPDATE username = VALUES(username)
      `, [message.author.id, message.author.username]);

      // --- 2. ALWAYS UPDATE MESSAGE COUNT ---
      await connection.execute(`
        INSERT INTO user_stats (user_id, message_count)
        VALUES (
          (SELECT id FROM users WHERE discord_id = ?),
          1
        )
        ON DUPLICATE KEY UPDATE message_count = message_count + 1
      `, [message.author.id]);

      // --- 3. CONDITIONAL ECONOMY REWARD ---
      const now = Date.now();
      const last = cooldown.get(message.author.id);
      
      if (message.content.length >= 8 && (!last || (now - last >= CHAT_COOLDOWN))) {
        const reward = Math.floor(Math.random() * 4) + 2; 
        
        await connection.execute(`
          INSERT INTO economy (user_id, balance, lifetime_earned, updated_at)
          VALUES (
            (SELECT id FROM users WHERE discord_id = ?),
            ?, ?, NOW()
          )
          ON DUPLICATE KEY UPDATE
            balance = balance + VALUES(balance),
            lifetime_earned = lifetime_earned + VALUES(lifetime_earned),
            updated_at = NOW()
        `, [message.author.id, reward, reward]);

        cooldown.set(message.author.id, now);
      }

      await connection.commit();
    } catch (err) {
      // FIX: Only rollback if connection exists AND is still active
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackErr) {
          console.error('❌ Rollback failed:', rollbackErr.message);
        }
      }
      console.error('❌ Database Error in messageCreate:', err.message);
    } finally {
      // FIX: Only release if connection was ever established
      if (connection) connection.release();
    }
  });
};