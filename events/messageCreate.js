const db = require('../db');
const ensureUser = require('../utils/ensureUser');

// Cooldown tracking (timestamp-based, no timers)
const cooldown = new Map();
const CHAT_COOLDOWN = 60 * 1000; // 60 seconds

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    // Basic guards
    if (!message.guild) return;
    if (message.author.bot) return;
    if (message.guild.id !== process.env.GUILD_ID) return;

    try {
      // 1. Ensure user exists & keep profile fresh
      await ensureUser(message.author);

      // 2. Increment message count (lightweight)
      await db.execute(
        `
        INSERT INTO user_stats (user_id, message_count)
        VALUES (
          (SELECT id FROM users WHERE discord_id = ? LIMIT 1),
          1
        )
        ON DUPLICATE KEY UPDATE
          message_count = message_count + 1
        `,
        [message.author.id]
      );

      // 3. Economy micro-reward with cooldown
      const now = Date.now();
      const last = cooldown.get(message.author.id);

      // Minimum length to prevent spam farming
      if (
        message.content.length >= 8 &&
        (!last || now - last >= CHAT_COOLDOWN)
      ) {
        const reward = Math.floor(Math.random() * 4) + 2; // ₹2–₹5

        await db.execute(
          `
          UPDATE economy
          SET balance = balance + ?,
              lifetime_earned = lifetime_earned + ?,
              updated_at = NOW()
          WHERE user_id = (
            SELECT id FROM users WHERE discord_id = ? LIMIT 1
          )
          `,
          [reward, reward, message.author.id]
        );

        // Update cooldown timestamp
        cooldown.set(message.author.id, now);
      }

    } catch (err) {
      // Never crash on high-frequency events
      console.error('❌ messageCreate DB Error:', err);
    }
  });
};
