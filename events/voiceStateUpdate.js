const db = require('../db');

const VOICE_REWARD_PER_INTERVAL = 10;
const INTERVAL_MINUTES = 5;

module.exports = (client) => {
  client.on('voiceStateUpdate', async (oldState, newState) => {
    const guildId = oldState.guild?.id || newState.guild?.id;
    if (guildId !== process.env.GUILD_ID) return;

    const userId = newState.id;

    // --- JOIN: Store current time in SECONDS ---
    if (!oldState.channelId && newState.channelId) {
      if (newState.member.user.bot) return;

      const startTime = Math.floor(Date.now() / 1000); // UTC Seconds

      await db.execute(`
        INSERT INTO users (discord_id, username) 
        VALUES (?, ?) ON DUPLICATE KEY UPDATE username = VALUES(username)
      `, [userId, newState.member.user.username]);

      // Note: Make sure 'joined_at' in DB is compatible or use a string
      await db.execute(`
        INSERT INTO voice_sessions (user_id, joined_at, channel_id)
        VALUES ((SELECT id FROM users WHERE discord_id = ?), FROM_UNIXTIME(?), ?)
        ON DUPLICATE KEY UPDATE joined_at = FROM_UNIXTIME(?), channel_id = VALUES(channel_id)
      `, [userId, startTime, newState.channelId, startTime]);
      return;
    }

    // --- LEAVE: Calculate based on UNIX Seconds ---
    if (oldState.channelId && !newState.channelId) {
      const [rows] = await db.execute(`
        SELECT UNIX_TIMESTAMP(joined_at) AS joined_seconds FROM voice_sessions 
        WHERE user_id = (SELECT id FROM users WHERE discord_id = ?)
      `, [userId]);

      if (!rows.length) return;

      const joinedSeconds = rows[0].joined_seconds;
      const nowSeconds = Math.floor(Date.now() / 1000);
      
      const diffInSeconds = nowSeconds - joinedSeconds;
      const totalMinutes = Math.floor(diffInSeconds / 60);

      // Sanity Check: Glitch protection
      if (diffInSeconds < 10) { 
          await db.execute(`DELETE FROM voice_sessions WHERE user_id = (SELECT id FROM users WHERE discord_id = ?)`, [userId]);
          return; 
      }

      // Logic for maximum 12 hours session (to prevent massive jumps if bot crashes)
      if (totalMinutes > 720) {
          await db.execute(`DELETE FROM voice_sessions WHERE user_id = (SELECT id FROM users WHERE discord_id = ?)`, [userId]);
          return;
      }

      const currencyReward = Math.floor(totalMinutes / INTERVAL_MINUTES) * VOICE_REWARD_PER_INTERVAL;

      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();

        if (totalMinutes > 0) {
          await connection.execute(`
            INSERT INTO user_stats (user_id, voice_minutes)
            VALUES ((SELECT id FROM users WHERE discord_id = ?), ?)
            ON DUPLICATE KEY UPDATE voice_minutes = voice_minutes + VALUES(voice_minutes)
          `, [userId, totalMinutes]);
        }

        if (currencyReward > 0) {
          await connection.execute(`
            INSERT INTO economy (user_id, balance, lifetime_earned, updated_at)
            VALUES ((SELECT id FROM users WHERE discord_id = ?), ?, ?, NOW())
            ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance), lifetime_earned = lifetime_earned + VALUES(lifetime_earned), updated_at = NOW()
          `, [userId, currencyReward, currencyReward]);
        }

        await connection.execute(`DELETE FROM voice_sessions WHERE user_id = (SELECT id FROM users WHERE discord_id = ?)`, [userId]);
        await connection.commit();
      } catch (err) {
        await connection.rollback();
        console.error('❌ Voice Stats Error:', err);
      } finally {
        connection.release();
      }
    }
  });
};