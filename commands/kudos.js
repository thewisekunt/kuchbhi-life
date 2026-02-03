const { SlashCommandBuilder } = require('discord.js');
const db = require('../db');
const cooldown = require('../cooldown');

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
    const target = interaction.options.getUser('user');
    const giver = interaction.user;
    const reason = interaction.options.getString('reason');

    if (target.id === giver.id) {
        return interaction.editReply('🙂 You cannot give kudos to yourself.');
    }

    // 10-minute cooldown (600 seconds)
    const timeLeft = cooldown(`kudos_${giver.id}`, 600);
    if (timeLeft > 0) {
        return interaction.editReply(`❤️ Try again in **${timeLeft} seconds**.`);
    }

    let conn;
    try {
      conn = await db.getConnection();
      await conn.beginTransaction();

      // Ensure users exist
      await conn.query(`INSERT IGNORE INTO users (discord_id, username) VALUES (?, ?)`, [giver.id, giver.username]);
      await conn.query(`INSERT IGNORE INTO users (discord_id, username) VALUES (?, ?)`, [target.id, target.username]);

      // Public counter
      await conn.query(`
        INSERT INTO kudos (user_id, count)
        VALUES ((SELECT id FROM users WHERE discord_id = ? LIMIT 1), 1)
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
      await interaction.editReply(`❤️ **${giver.username} appreciated ${target.username}**${reason ? `\n*“${reason}”*` : ''}`);

    } catch (err) {
      if (conn) await conn.rollback();
      console.error('Kudos Error:', err.message);
      await interaction.editReply('❌ Failed to give kudos due to a database error.');
    } finally {
      if (conn) conn.release(); // 💡 CRITICAL: Connection must be released back to the pool
    }
  }
};