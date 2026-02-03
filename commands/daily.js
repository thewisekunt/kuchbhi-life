const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');

const DAILY_MIN = 100;
const DAILY_MAX = 200;
const COOLDOWN_HOURS = 24;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily rupees'),

  async execute(interaction) {
    const user = interaction.user;

    try {
        // Ensure user exists first
        await db.execute(
          `INSERT IGNORE INTO users (discord_id, username) VALUES (?, ?)`,
          [user.id, user.username]
        );

        const [[claim]] = await db.execute(`
          SELECT last_claim
          FROM daily_claims
          WHERE user_id = (SELECT id FROM users WHERE discord_id = ? LIMIT 1)
        `, [user.id]);

        if (claim) {
          const last = new Date(claim.last_claim);
          const diffHours = (Date.now() - last) / (1000 * 60 * 60);

          if (diffHours < COOLDOWN_HOURS) {
            const remaining = Math.ceil(COOLDOWN_HOURS - diffHours);
            return interaction.editReply(
              `⏳ You already claimed your daily. Come back in **${remaining} hours**.`
            );
          }
        }

        const reward = Math.floor(Math.random() * (DAILY_MAX - DAILY_MIN + 1)) + DAILY_MIN;

        // Apply reward and update claim time in a single transaction if possible, 
        // but here we use individual queries for safety.
        await db.execute(`
          INSERT INTO economy (user_id, balance, lifetime_earned, updated_at)
          VALUES ((SELECT id FROM users WHERE discord_id = ? LIMIT 1), ?, ?, NOW())
          ON DUPLICATE KEY UPDATE
            balance = balance + VALUES(balance),
            lifetime_earned = lifetime_earned + VALUES(lifetime_earned),
            updated_at = NOW()
        `, [user.id, reward, reward]);

        await db.execute(`
          INSERT INTO daily_claims (user_id, last_claim)
          VALUES ((SELECT id FROM users WHERE discord_id = ? LIMIT 1), NOW())
          ON DUPLICATE KEY UPDATE last_claim = NOW()
        `, [user.id]);

        const embed = new EmbedBuilder()
            .setTitle('🎁 Daily Reward')
            .setDescription(`You received **₹${reward}**!`)
            .setColor('#3498db')
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

    } catch (err) {
        console.error('Daily Command Error:', err.message);
        await interaction.editReply({ content: '❌ Failed to claim daily reward.' });
    }
  }
};