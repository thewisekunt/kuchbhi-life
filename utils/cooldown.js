const cooldowns = new Map();

module.exports = (key, seconds) => {
  const now = Date.now();
  const expires = cooldowns.get(key);

  if (expires && expires > now) {
    return Math.ceil((expires - now) / 1000);
  }

  cooldowns.set(key, now + seconds * 1000);
  return 0;
};
