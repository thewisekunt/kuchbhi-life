const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');
const ensureUser = require('../utils/ensureUser');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('slut')
    .setDescription('High risk, high reward. Can you handle the streets?'),

  async execute(interaction) {
    const user = interaction.user;

    // Ensure user + economy row exist
    await ensureUser(user);

    const isWin = Math.random() > 0.5; // 50/50 chance
    const amount = Math.floor(Math.random() * 300) + 50; // ₹50–₹350

    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const [[row]] = await conn.query(
        `
        SELECT balance
        FROM economy
        WHERE user_id = (
          SELECT id FROM users WHERE discord_id = ? LIMIT 1
        )
        `,
        [user.id]
      );

      const balance = row?.balance ?? 0;

      if (isWin) {
        await conn.query(
          `
          UPDATE economy
          SET balance = balance + ?,
              lifetime_earned = lifetime_earned + ?
          WHERE user_id = (
            SELECT id FROM users WHERE discord_id = ? LIMIT 1
          )
          `,
          [amount, amount, user.id]
        );

        await conn.commit();

        const embed = new EmbedBuilder()
          .setTitle('💸 Success!')
          .setDescription(
            `You went out and came back with **₹${amount}**!`
          )
          .setColor('#2ecc71');

        return interaction.editReply({ embeds: [embed] });
      }

      // LOSS CASE
      const loss = Math.min(balance, amount);

      if (loss > 0) {
        await conn.query(
          `
          UPDATE economy
          SET balance = balance - ?
          WHERE user_id = (
            SELECT id FROM users WHERE discord_id = ? LIMIT 1
          )
          `,
          [loss, user.id]
        );
      }

      await conn.commit();

      const embed = new EmbedBuilder()
        .setTitle('👮 Busted!')
        .setDescription(
          `The cops caught you. You lost **₹${loss}** in fines.`
        )
        .setColor('#e74c3c');

      return interaction.editReply({ embeds: [embed] });

    } catch (err) {
      await conn.rollback();
      console.error('Slut Command Error:', err);
      return interaction.editReply('❌ Something went wrong. Try again later.');
    } finally {
      conn.release();
    }
  }
};
