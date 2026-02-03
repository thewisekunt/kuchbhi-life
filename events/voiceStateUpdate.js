const db = require('../db');
const ensureUser = require('../utils/ensureUser');

const VOICE_REWARD_PER_INTERVAL = 10; // ₹10
const INTERVAL_MINUTES = 5;

module.exports = (client) => {
  client.on('voiceStateUpdate', async (oldState, newState) => {
    const guildId =
      oldState.guild?.id || newState.guild?.id;

    if (guildId !== process.env.GUILD_ID) return;

    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    const userId = member.user.id;

    /* ======================
       JOIN VC
    ====================== */
    if (!oldState.channelId && newState.channelId) {
      try {
        // Ensure user exists
        await ensureUser(member.user);

        // Insert session ONLY if not already present
        await db.execute(
          `
          INSERT IGNORE INTO voice_sessions (user_id, joined_at, channel_id)
          VALUES (
            (SELECT id FROM users WHERE discord_id = ? LIMIT 1),
            NOW(),
            ?
          )
          `,
          [userId, newState.channelId]
        );
      } catch (err) {
        console.error('❌ Voice Join Error:', err);
      }
      return;
    }

    /* ======================
       LEAVE VC
    ====================== */
    if (oldState.channelId && !newState.channelId) {
      const conn = await db.getConnection();

      try {
        await conn.beginTransaction();

        const [[session]] = await conn.query(
          `
          SELECT
            UNIX_TIMESTAMP(joined_at) AS joined_seconds
          FROM voice_sessions
          WHERE user_id = (
            SELECT id FROM users WHERE discord_id = ? LIMIT 1
          )
          `,
          [userId]
        );

        if (!session) {
          await conn.rollback();
          return;
        }

        const nowSeconds = Math.floor(Date.now() / 1000);
        const totalMinutes = Math.floor(
          (nowSeconds - session.joined_seconds) / 60
        );

        // Sanity checks
        if (totalMinutes < 1 || totalMinutes > 720) {
          await conn.query(
            `
            DELETE FROM voice_sessions
            WHERE user_id = (
              SELECT id FROM users WHERE discord_id = ? LIMIT 1
            )
            `,
            [userId]
          );
          await conn.commit();
          return;
        }

        const rewardIntervals =
          Math.floor(totalMinutes / INTERVAL_MINUTES);

        const currencyReward =
          rewardIntervals * VOICE_REWARD_PER_INTERVAL;

        // Update voice minutes
        await conn.query(
          `
          INSERT INTO user_stats (user_id, voice_minutes)
          VALUES (
            (SELECT id FROM users WHERE discord_id = ? LIMIT 1),
            ?
          )
          ON DUPLICATE KEY UPDATE
            voice_minutes = voice_minutes + VALUES(voice_minutes)
          `,
          [userId, totalMinutes]
        );

        // Economy reward (if applicable)
        if (currencyReward > 0) {
          await conn.query(
            `
            UPDATE economy
            SET balance = balance + ?,
                lifetime_earned = lifetime_earned + ?,
                updated_at = NOW()
            WHERE user_id = (
              SELECT id FROM users WHERE discord_id = ? LIMIT 1
            )
            `,
            [currencyReward, currencyReward, userId]
          );
        }

        // Cleanup session
        await conn.query(
          `
          DELETE FROM voice_sessions
          WHERE user_id = (
            SELECT id FROM users WHERE discord_id = ? LIMIT 1
          )
          `,
          [userId]
        );

        await conn.commit();

      } catch (err) {
        await conn.rollback();
        console.error('❌ Voice Leave Error:', err);
      } finally {
        conn.release();
      }
    }
  });
};
