const { SlashCommandBuilder } = require('discord.js');
const db = require('../db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription('Send money 💸')
    .addUserOption(opt =>
      opt.setName('user').setDescription('Receiver').setRequired(true))
    .addIntegerOption(opt =>
      opt.setName('amount').setDescription('Amount').setRequired(true)),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    if (amount <= 0) {
      return interaction.reply({ content: '❌ Invalid amount.', ephemeral: true });
    }

    const [[sender]] = await db.query(
      `SELECT balance FROM economy WHERE user_id = (
         SELECT id FROM users WHERE discord_id=?
       )`,
      [interaction.user.id]
    );

    if (!sender || sender.balance < amount) {
      return interaction.reply({ content: '💸 Not enough money.', ephemeral: true });
    }

    await db.query('START TRANSACTION');

    try {
      await db.query(`
        UPDATE economy
        SET balance = balance - ?
        WHERE user_id = (SELECT id FROM users WHERE discord_id=?)
      `, [amount, interaction.user.id]);

      await db.query(`
        UPDATE economy
        SET balance = balance + ?
        WHERE user_id = (SELECT id FROM users WHERE discord_id=?)
      `, [amount, target.id]);

      await db.query('COMMIT');

      interaction.reply(`💸 **₹${amount}** sent to **${target.username}**`);
    } catch {
      await db.query('ROLLBACK');
      interaction.reply({ content: '❌ Transaction failed.', ephemeral: true });
    }
  }
};
