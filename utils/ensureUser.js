/**
 * ensureUser.js (UPGRADED)
 * --------------------------------
 * Guarantees a Discord user exists in:
 * 1. users table
 * 2. economy table
 *
 * SAFE to call repeatedly.
 * Optimized for high-frequency events.
 */

const db = require('../db');

// 🧠 In-memory cache to prevent DB spam
const ensuredUsers = new Set();

// ⏱️ Optional TTL cleanup (prevents memory bloat on long uptime)
setInterval(() => {
  ensuredUsers.clear();
}, 1000 * 60 * 30); // clear every 30 minutes

module.exports = async function ensureUser(discordUser) {
  if (!discordUser || discordUser.bot) return;

  const discordId = discordUser.id;

  // 🚫 Already ensured during this runtime window
  if (ensuredUsers.has(discordId)) return;

  const username =
    discordUser.username ||
    discordUser.globalName ||
    'Unknown';

  try {
    // 1️⃣ Ensure user row
    await db.execute(
      `
      INSERT INTO users (discord_id, username)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE
        username = VALUES(username)
      `,
      [discordId, username]
    );

    // 2️⃣ Ensure economy row
    await db.execute(
      `
      INSERT IGNORE INTO economy (user_id, balance, lifetime_earned)
      VALUES (
        (SELECT id FROM users WHERE discord_id = ? LIMIT 1),
        0,
        0
      )
      `,
      [discordId]
    );

    // ✅ Mark as ensured ONLY after success
    ensuredUsers.add(discordId);

  } catch (err) {
    /**
     * ECONNRESET / transient errors:
     * - MySQL closed connection
     * - Pool reconnects automatically
     * - We silently ignore and retry later
     */
    if (err.code === 'ECONNRESET') return;
    if (err.code === 'PROTOCOL_CONNECTION_LOST') return;

    console.error('❌ ensureUser Error:', err.message);
  }
};
