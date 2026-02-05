const db = require('../db');
const ensureUser = require('../utils/ensureUser');

// Cooldowns
const messageCooldown = new Map();
const rewardCooldown = new Map();

const MESSAGE_INTERVAL = 30 * 1000; // stats update every 30s
const REWARD_INTERVAL = 60 * 1000;  // economy reward every 60s

module.exports = (client) => {
  client.on('messageCreate', async (message) => {
    if (!message.guild) return;
    if (message.author.bot) return;
    if (message.guild.id !== process.env.GUILD_ID) return;

    const userId = message.author.id;
    const now = Date.now();

    try {
      // ✅ Ensure user (cached)
      await ensureUser(message.author);

      /* ──────────────────────────────
         1️⃣ MESSAGE COUNT (THROTTLED)
      ────────────────────────────── */
      const lastStat = messageCooldown.get(userId);
      if (!lastStat || now - lastStat > MESSAGE_INTERVAL) {
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
          [userId]
        );

        messageCooldown.set(userId, now);
      }

      /* ──────────────────────────────
         2️⃣ ECONOMY MICRO-REWARD
      ────────────────────────────── */
      const lastReward = rewardCooldown.get(userId);

      if (
        message.content.length >= 8 &&
        (!lastReward || now - lastReward > REWARD_INTERVAL)
      ) {
        const reward = Math.floor(Math.random() * 4) + 2;

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
          [reward, reward, userId]
        );

        rewardCooldown.set(userId, now);
      }

    } catch (err) {
      // ✅ ECONNRESET is recoverable
      if (err.code === 'ECONNRESET') return;

      console.error('❌ messageCreate DB Error:', err.message);
    }
  });
};
