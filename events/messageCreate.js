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

      // ✅ Ensure user exists in DB first
      await ensureUser(message.author);

      /* ──────────────────────────────
         🌟 NEW: SYNC DISPLAY NAME & AVATAR
      ────────────────────────────── */
      // Get server nickname if it exists, otherwise fallback to global name or username
      const serverDisplayName = message.member ? message.member.displayName : (message.author.globalName || message.author.username);
      const currentAvatar = message.author.avatar || '';

      await db.execute(
        `
        UPDATE users 
        SET username = ?, global_name = ?, avatar = ?, in_server = 1 
        WHERE discord_id = ?
        `,
        [message.author.username, serverDisplayName, currentAvatar, userId]
      );

      /* ──────────────────────────────
         🟢 0️⃣ LAST SEEN TRACKING
      ────────────────────────────── */
      await db.execute(
        `
        INSERT INTO last_seen (discord_id, last_message_at, last_channel_id)
        VALUES (?, NOW(), ?)
        ON DUPLICATE KEY UPDATE
          last_message_at = NOW(),
          last_channel_id = VALUES(last_channel_id)
        `,
        [userId, message.channel.id]
      );

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
         2️⃣ ECONOMY MICRO-REWARD & ACTIVITY
      ────────────────────────────── */
      const lastReward = rewardCooldown.get(userId);

      if (
        message.content.length >= 8 &&
        (!lastReward || now - lastReward > REWARD_INTERVAL)
      ) {
        const reward = Math.floor(Math.random() * 4) + 2;

        // 1. Update the balance
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

        // 2. Log the activity for the profile page
        await db.execute(
          `
          INSERT INTO activity_log (user_id, discord_id, type, metadata, created_at)
          VALUES (
            (SELECT id FROM users WHERE discord_id = ? LIMIT 1),
            ?, 
            'EARN', 
            ?, 
            NOW()
          )
          `,
          [userId, userId, `Earned ₹${reward} for chatting in the server`]
        );

        rewardCooldown.set(userId, now);
      }

    } catch (err) {
      if (err.code === 'ECONNRESET') return;
      console.error('❌ messageCreate DB Error:', err.message);
    }
  });

};
