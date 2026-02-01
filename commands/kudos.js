const { SlashCommandBuilder } = require('discord.js');
const db = require('../db');

const COOLDOWN_SECONDS = 600;
const cooldowns = new Map();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kudos')
    .setDescription('Appreciate a server member')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('Who deserves appreciation')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('reason')
        .setDescription('Optional reason')
    ),

  async execute(interaction) {
    await interaction.deferReply(); // 🔑 prevents timeout

    try {
      const target = interaction.options.getUser('user');
      const giver = interaction.user;
      const reason = interaction.options.getString('reason');

      // 🚫 Self kudos
      if (target.id === giver.id) {
        return interaction.editReply('🙂 You cannot give kudos to yourself.');
      }

      // ⏱️ Cooldown
      const key = `kudos:${giver.id}`;
      const now = Date.now();
      const expires = cooldowns.get(key);

      if (expires && expires > now) {
        const remaining = Math.ceil((expires - now) / 1000);
        return interaction.editReply(`❤️ Try again in ${remaining}s`);
      }

      cooldowns.set(key, now + COOLDOWN_SECONDS * 1000);

      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        // Ensure users exist
        await conn.query(
          `INSERT IGNORE INTO users (discord_id, username) VALUES (?, ?)`,
          [giver.id, giver.username]
        );
        await conn.query(
          `INSERT IGNORE INTO users (discord_id, username) VALUES (?, ?)`,
          [target.id, target.username]
        );

        // Public counter
        await conn.query(`
          INSERT INTO kudos (user_id, count)
          SELECT id, 1 FROM users WHERE discord_id = ?
          ON DUPLICATE KEY UPDATE count = count + 1
        `, [target.id]);

        // Private log
        await conn.query(`
          INSERT INTO kudos_logs (giver_id, receiver_id)
          SELECT g.id, r.id
          FROM users g, users r
          WHERE g.discord_id = ? AND r.discord_id = ?
        `, [giver.id, target.id]);

        await conn.commit();

        await interaction.editReply(
          `❤️ **${giver.username} appreciated ${target.username}**` +
          (reason ? `\n*“${reason}”*` : '')
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
