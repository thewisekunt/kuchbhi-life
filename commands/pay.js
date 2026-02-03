const { SlashCommandBuilder } = require('discord.js');
const db = require('../db');
const ensureUser = require('../utils/ensureUser');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription('Send money 💸')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('Receiver')
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('amount')
        .setDescription('Amount')
        .setRequired(true)
    ),

  async execute(interaction) {
    const senderUser = interaction.user;
    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    if (amount <= 0) {
      return interaction.editReply('❌ Invalid amount.');
    }

    if (targetUser.id === senderUser.id) {
      return interaction.editReply('🤨 You cannot pay yourself.');
    }

    // Ensure both users & economy rows exist
    await ensureUser(senderUser);
    await ensureUser(targetUser);

    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const [[sender]] = await conn.query(
        `
        SELECT balance
        FROM economy
        WHERE user_id = (
          SELECT id FROM users WHERE discord_id = ? LIMIT 1
        )
        `,
        [senderUser.id]
      );

      if (!sender || sender.balance < amount) {
        await conn.rollback();
        return interaction.editReply('💸 You do not have enough balance.');
      }

      // Debit sender
      await conn.query(
        `
        UPDATE economy
        SET balance = balance - ?
        WHERE user_id = (
          SELECT id FROM users WHERE discord_id = ? LIMIT 1
        )
        `,
        [amount, senderUser.id]
      );

      // Credit receiver
      await conn.query(
        `
        UPDATE economy
        SET balance = balance + ?
        WHERE user_id = (
          SELECT id FROM users WHERE discord_id = ? LIMIT 1
        )
        `,
        [amount, targetUser.id]
      );

      await conn.commit();

      return interaction.editReply(
        `💸 **₹${amount}** sent to **${targetUser.username}**`
      );

    } catch (err) {
      await conn.rollback();
      console.error('Pay Command Error:', err);
      return interaction.editReply('❌ Transaction failed. Please try again.');
    } finally {
      conn.release();
    }
  }
};
