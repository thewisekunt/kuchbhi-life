const { SlashCommandBuilder } = require('discord.js');
const db = require('../db');
const ensureUser = require('../utils/ensureUser');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rob')
    .setDescription('Attempt a robbery 😈')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('Target')
        .setRequired(true)
    ),

  async execute(interaction) {
    const robberUser = interaction.user;
    const targetUser = interaction.options.getUser('user');

    if (targetUser.id === robberUser.id) {
      return interaction.editReply('🤡 Rob yourself? That’s impressive.');
    }

    // Ensure both users & economy rows exist
    await ensureUser(robberUser);
    await ensureUser(targetUser);

    const success = Math.random() < 0.3;
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const [[robber]] = await conn.query(
        `
        SELECT balance
        FROM economy
        WHERE user_id = (
          SELECT id FROM users WHERE discord_id = ? LIMIT 1
        )
        `,
        [robberUser.id]
      );

      const [[victim]] = await conn.query(
        `
        SELECT balance
        FROM economy
        WHERE user_id = (
          SELECT id FROM users WHERE discord_id = ? LIMIT 1
        )
        `,
        [targetUser.id]
      );

      if (!robber || !victim) {
        await conn.rollback();
        return interaction.editReply('❌ User data missing.');
      }

      let amount = 0;

      if (success && victim.balance > 0) {
        amount = Math.max(
          1,
          Math.floor(victim.balance * (0.1 + Math.random() * 0.2))
        );

        await conn.query(
          `
          UPDATE economy
          SET balance = balance + ?
          WHERE user_id = (
            SELECT id FROM users WHERE discord_id = ? LIMIT 1
          )
          `,
          [amount, robberUser.id]
        );

        await conn.query(
          `
          UPDATE economy
          SET balance = balance - ?
          WHERE user_id = (
            SELECT id FROM users WHERE discord_id = ? LIMIT 1
          )
          `,
          [amount, targetUser.id]
        );

        await conn.commit();

        return interaction.editReply(
          `😈 **Successful robbery!** You stole **₹${amount}** from **${targetUser.username}**`
        );
      }

      // Failed robbery → penalty
      if (robber.balance > 0) {
        amount = Math.max(
          1,
          Math.floor(robber.balance * (0.05 + Math.random() * 0.1))
        );

        await conn.query(
          `
          UPDATE economy
          SET balance = balance - ?
          WHERE user_id = (
            SELECT id FROM users WHERE discord_id = ? LIMIT 1
          )
          `,
          [amount, robberUser.id]
        );
      }

      await conn.commit();

      return interaction.editReply(
        `🚓 **Failed robbery!** You lost **₹${amount}**`
      );

    } catch (err) {
      await conn.rollback();
      console.error('Rob Command Error:', err);
      return interaction.editReply('❌ Robbery failed. Try again later.');
    } finally {
      conn.release();
    }
  }
};
