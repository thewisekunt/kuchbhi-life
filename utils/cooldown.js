const cooldowns = new Map();

/**
 * Global Cooldown Utility
 * @param {string} key - Unique key (e.g., 'command_userid')
 * @param {number} seconds - Cooldown duration
 * @returns {number} - Seconds remaining (0 if no cooldown)
 */
module.exports = (key, seconds) => {
  const now = Date.now();
  const expires = cooldowns.get(key);

  if (expires && expires > now) {
    return Math.ceil((expires - now) / 1000);
  }

  const durationMs = seconds * 1000;
  cooldowns.set(key, now + durationMs);

  // Memory Management: Remove the key once it expires
  setTimeout(() => {
    cooldowns.delete(key);
  }, durationMs);

  return 0;
};