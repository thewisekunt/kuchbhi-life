const { SlashCommandBuilder } = require('discord.js');
const db = require('../db');
const cooldown = require('../cooldown');
const ensureUser = require('../utils/ensureUser');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kudos')
    .setDescription('Appreciate a server member (anonymous)')
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('Who deserves appreciation')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName('reason')
        .setDescription('Optional reason (private)')
    ),

  async execute(interaction) {
    const giver = interaction.user;
    const target = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    if (target.id === giver.id) {
      return interaction.editReply('🙂 You cannot give kudos to yourself.');
    }

    // Cooldown: 10 minutes (600s)
    const timeLeft = cooldown(`kudos_${giver.id}`, 600);
    if (timeLeft > 0) {
      return interaction.editReply(
        `❤️ You can give kudos again in **${timeLeft} seconds**.`
      );
    }

    // Ensure both users exist
    await ensureUser(giver);
    await ensureUser(target);

    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      // Increment public kudos count (anonymous)
      await conn.query(
        `
        INSERT INTO kudos (user_id, count)
        VALUES (
          (SELECT id FROM users WHERE discord_id = ? LIMIT 1),
          1
        )
        ON DUPLICATE KEY UPDATE count = count + 1
        `,
        [target.id]
      );

      // Private log (giver hidden from UI)
      await conn.query(
        `
        INSERT INTO kudos_logs (giver_id, receiver_id, reason)
        SELECT g.id, r.id, ?
        FROM users g, users r
        WHERE g.discord_id = ? AND r.discord_id = ?
        `,
        [reason || null, giver.id, target.id]
      );

      await conn.commit();

      // Public-facing response (anonymous)
      return interaction.editReply(
        `❤️ **${target.username} received kudos!**\n` +
        (reason ? `📝 *"${reason}"*` : '')
      );

    } catch (err) {
      await conn.rollback();
      console.error('Kudos Error:', err);
      return interaction.editReply(
        '❌ Failed to give kudos due to a database error.'
      );
    } finally {
      conn.release();
    }
  }
};
