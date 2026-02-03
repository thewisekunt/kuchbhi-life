/**
 * cooldown.js
 * -------------------------
 * Global cooldown utility (timer-free, memory-safe)
 *
 * Usage:
 *   const timeLeft = cooldown('work_123', 3600);
 *   if (timeLeft > 0) return;
 */

const cooldowns = new Map();

module.exports = function cooldown(key, seconds) {
  const now = Date.now();
  const expiresAt = cooldowns.get(key);

  // Active cooldown
  if (expiresAt && expiresAt > now) {
    return Math.ceil((expiresAt - now) / 1000);
  }

  // Set new cooldown
  cooldowns.set(key, now + seconds * 1000);
  return 0;
};
