const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');
const ensureUser = require('../utils/ensureUser');

const DAILY_MIN = 100;
const DAILY_MAX = 200;
const COOLDOWN_HOURS = 24;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily rupees'),

  async execute(interaction) {
    const user = interaction.user;

    // Ensure user + economy row exist
    await ensureUser(user);

    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const [[claim]] = await conn.query(
        `
        SELECT last_claim
        FROM daily_claims
        WHERE user_id = (
          SELECT id FROM users WHERE discord_id = ? LIMIT 1
        )
        `,
        [user.id]
      );

      if (claim?.last_claim) {
        const last = new Date(claim.last_claim);
        const diffHours = (Date.now() - last.getTime()) / (1000 * 60 * 60);

        if (diffHours < COOLDOWN_HOURS) {
          await conn.rollback();
          const remaining = Math.ceil(COOLDOWN_HOURS - diffHours);
          return interaction.editReply(
            `⏳ You already claimed your daily. Come back in **${remaining} hours**.`
          );
        }
      }

      const reward =
        Math.floor(Math.random() * (DAILY_MAX - DAILY_MIN + 1)) + DAILY_MIN;

      // Apply economy reward
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
        [reward, reward, user.id]
      );

      // Update daily claim timestamp
      await conn.query(
        `
        INSERT INTO daily_claims (user_id, last_claim)
        VALUES (
          (SELECT id FROM users WHERE discord_id = ? LIMIT 1),
          NOW()
        )
        ON DUPLICATE KEY UPDATE last_claim = NOW()
        `,
        [user.id]
      );

      await conn.commit();

      const embed = new EmbedBuilder()
        .setTitle('🎁 Daily Reward')
        .setDescription(`You received **₹${reward}**!`)
        .setColor('#3498db')
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });

    } catch (err) {
      await conn.rollback();
      console.error('Daily Command Error:', err);
      return interaction.editReply('❌ Failed to claim daily reward.');
    } finally {
      conn.release();
    }
  }
};
