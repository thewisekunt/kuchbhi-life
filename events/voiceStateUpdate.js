const db = require('../db');

const VOICE_REWARD_PER_INTERVAL = 10;
const INTERVAL_MINUTES = 5;

module.exports = (client) => {
  client.on('voiceStateUpdate', async (oldState, newState) => {
    const guildId = oldState.guild?.id || newState.guild?.id;
    if (guildId !== process.env.GUILD_ID) return;

    const userId = newState.id;

    // --- JOIN LOGIC ---
    if (!oldState.channelId && newState.channelId) {
      if (newState.member.user.bot) return;

      const startTime = Math.floor(Date.now() / 1000);

      try {
        await db.execute(`
          INSERT INTO users (discord_id, username) 
          VALUES (?, ?) ON DUPLICATE KEY UPDATE username = VALUES(username)
        `, [userId, newState.member.user.username]);

        await db.execute(`
          INSERT INTO voice_sessions (user_id, joined_at, channel_id)
          VALUES ((SELECT id FROM users WHERE discord_id = ? LIMIT 1), FROM_UNIXTIME(?), ?)
          ON DUPLICATE KEY UPDATE joined_at = FROM_UNIXTIME(?), channel_id = VALUES(channel_id)
        `, [userId, startTime, newState.channelId, startTime]);
      } catch (err) {
        console.error('❌ Voice Join Error:', err.message);
      }
      return;
    }

    // --- LEAVE LOGIC ---
    if (oldState.channelId && !newState.channelId) {
      let connection;
      try {
        const [rows] = await db.execute(`
          SELECT UNIX_TIMESTAMP(joined_at) AS joined_seconds FROM voice_sessions 
          WHERE user_id = (SELECT id FROM users WHERE discord_id = ? LIMIT 1)
        `, [userId]);

        if (!rows.length) return;

        const joinedSeconds = rows[0].joined_seconds;
        const totalMinutes = Math.floor((Math.floor(Date.now() / 1000) - joinedSeconds) / 60);

        // Sanity Checks (Ignore < 10s or > 12h)
        if (totalMinutes < 0 || totalMinutes > 720) {
          return await db.execute(`DELETE FROM voice_sessions WHERE user_id = (SELECT id FROM users WHERE discord_id = ? LIMIT 1)`, [userId]);
        }

        const currencyReward = Math.floor(totalMinutes / INTERVAL_MINUTES) * VOICE_REWARD_PER_INTERVAL;

        connection = await db.getConnection();
        await connection.beginTransaction();

        if (totalMinutes > 0) {
          await connection.execute(`
            INSERT INTO user_stats (user_id, voice_minutes)
            VALUES ((SELECT id FROM users WHERE discord_id = ? LIMIT 1), ?)
            ON DUPLICATE KEY UPDATE voice_minutes = voice_minutes + VALUES(voice_minutes)
          `, [userId, totalMinutes]);
        }

        if (currencyReward > 0) {
          await connection.execute(`
            INSERT INTO economy (user_id, balance, lifetime_earned, updated_at)
            VALUES ((SELECT id FROM users WHERE discord_id = ? LIMIT 1), ?, ?, NOW())
            ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance), lifetime_earned = lifetime_earned + VALUES(lifetime_earned), updated_at = NOW()
          `, [userId, currencyReward, currencyReward]);
        }

        await connection.execute(`DELETE FROM voice_sessions WHERE user_id = (SELECT id FROM users WHERE discord_id = ? LIMIT 1)`, [userId]);
        await connection.commit();
      } catch (err) {
        if (connection) await connection.rollback();
        console.error('❌ Voice Leave Error:', err.message);
      } finally {
        if (connection) connection.release();
      }
    }
  });
};