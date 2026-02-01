const { SlashCommandBuilder } = require('discord.js');
const db = require('../db');

const COOLDOWN_SECONDS = 600;
const cooldowns = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slap')
    .setDescription('Slap a server member')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('Who deserves it')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply(); // 🔑 prevents timeout

    try {
      const target = interaction.options.getUser('user');
      const slapper = interaction.user;

      // 🚫 Self slap
      if (target.id === slapper.id) {
        return interaction.editReply('🤨 You cannot slap yourself.');
      }

      // ⏱️ Cooldown
      const key = `slap:${slapper.id}`;
      const now = Date.now();
      const expires = cooldowns.get(key);

      if (expires && expires > now) {
        const remaining = Math.ceil((expires - now) / 1000);
        return interaction.editReply(`✋ Cooldown active. Try again in ${remaining}s`);
      }

      cooldowns.set(key, now + COOLDOWN_SECONDS * 1000);

      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        // Ensure users exist
        await conn.query(
          `INSERT IGNORE INTO users (discord_id, username) VALUES (?, ?)`,
          [slapper.id, slapper.username]
        );
        await conn.query(
          `INSERT IGNORE INTO users (discord_id, username) VALUES (?, ?)`,
          [target.id, target.username]
        );

        // Public counter
        await conn.query(`
          INSERT INTO slaps (user_id, count)
          SELECT id, 1 FROM users WHERE discord_id = ?
          ON DUPLICATE KEY UPDATE count = count + 1
        `, [target.id]);

        // Private log
        await conn.query(`
          INSERT INTO slap_logs (slapper_id, target_id)
          SELECT s.id, t.id
          FROM users s, users t
          WHERE s.discord_id = ? AND t.discord_id = ?
        `, [slapper.id, target.id]);

        await conn.commit();

        await interaction.editReply(
          `👋 **${slapper.username} slapped ${target.username}**`
        );

      } catch (dbErr) {
        await conn.rollback();
        console.error(dbErr);
        await interaction.editReply('❌ Database error occurred.');
      } finally {
        conn.release();
      }

    } catch (err) {
      console.error(err);
      if (interaction.deferred) {
        await interaction.editReply('❌ Something went wrong.');
      }
    }
  }
};
