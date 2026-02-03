/**
 * ensureUser.js
 * -------------------------
 * Guarantees that a Discord user exists in:
 * 1. users table
 * 2. economy table
 *
 * This function is SAFE to call repeatedly.
 * It prevents silent failures across commands & events.
 */

const db = require('../db');

module.exports = async function ensureUser(discordUser) {
  if (!discordUser || discordUser.bot) return;

  const discordId = discordUser.id;
  const username =
    discordUser.username ||
    discordUser.globalName ||
    'Unknown';

  // 1. Ensure user exists
  await db.execute(
    `
    INSERT INTO users (discord_id, username)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE
      username = VALUES(username)
    `,
    [discordId, username]
  );

  // 2. Ensure economy row exists
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
};
