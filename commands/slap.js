const { SlashCommandBuilder } = require('discord.js');
const db = require('../db');
const cooldown = require('../cooldown');
const ensureUser = require('../utils/ensureUser');

const COOLDOWN_SECONDS = 600; // 10 minutes

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slap')
    .setDescription('Slap a server member')
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('Who deserves it')
        .setRequired(true)
    ),

  async execute(interaction) {
    const slapper = interaction.user;
    const target = interaction.options.getUser('user');

    // 🚫 Self slap
    if (slapper.id === target.id) {
      return interaction.editReply('🤨 You cannot slap yourself.');
    }

    // ⏱️ Cooldown (global, timer-free)
    const timeLeft = cooldown(`slap_${slapper.id}`, COOLDOWN_SECONDS);
    if (timeLeft > 0) {
      return interaction.editReply(
        `✋ Cooldown active. Try again in **${timeLeft}s**.`
      );
    }

    // Ensure both users exist
    await ensureUser(slapper);
    await ensureUser(target);

    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      // Public slap counter (anonymous aggregation)
      await conn.query(
        `
        INSERT INTO slaps (user_id, count)
        VALUES (
          (SELECT id FROM users WHERE discord_id = ? LIMIT 1),
          1
        )
        ON DUPLICATE KEY UPDATE count = count + 1
        `,
        [target.id]
      );

      // Private log (slapper identity stored)
      await conn.query(
        `
        INSERT INTO slap_logs (slapper_id, target_id)
        SELECT s.id, t.id
        FROM users s, users t
        WHERE s.discord_id = ? AND t.discord_id = ?
        `,
        [slapper.id, target.id]
      );

      await conn.commit();

      return interaction.editReply(
        `👋 **${target.username}** got slapped!`
      );

    } catch (err) {
      await conn.rollback();
      console.error('Slap Command Error:', err);
      return interaction.editReply(
        '❌ Database error occurred while slapping.'
      );
    } finally {
      conn.release();
    }
  }
};
