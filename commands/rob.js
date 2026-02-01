const { SlashCommandBuilder } = require('discord.js');
const db = require('../db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rob')
    .setDescription('Attempt a robbery 😈')
    .addUserOption(opt =>
      opt.setName('user').setDescription('Target').setRequired(true)),

  async execute(interaction) {
    const target = interaction.options.getUser('user');

    if (target.id === interaction.user.id) {
      return interaction.reply({ content: '🤡 Rob yourself?', ephemeral: true });
    }

    const success = Math.random() < 0.3;

    const [[robber]] = await db.query(`
      SELECT balance FROM economy
      WHERE user_id = (SELECT id FROM users WHERE discord_id=?)
    `, [interaction.user.id]);

    const [[victim]] = await db.query(`
      SELECT balance FROM economy
      WHERE user_id = (SELECT id FROM users WHERE discord_id=?)
    `, [target.id]);

    if (!robber || !victim) {
      return interaction.reply({ content: '❌ User not found.', ephemeral: true });
    }

    let amount;

    await db.query('START TRANSACTION');

    try {
      if (success) {
        amount = Math.floor(victim.balance * (0.1 + Math.random() * 0.2));
        await db.query(`
          UPDATE economy SET balance = balance + ?
          WHERE user_id = (SELECT id FROM users WHERE discord_id=?)
        `, [amount, interaction.user.id]);

        await db.query(`
          UPDATE economy SET balance = balance - ?
          WHERE user_id = (SELECT id FROM users WHERE discord_id=?)
        `, [amount, target.id]);

        await db.query('COMMIT');

        interaction.reply(`😈 **Successful robbery!** You stole ₹${amount}`);
      } else {
        amount = Math.floor(robber.balance * (0.05 + Math.random() * 0.1));
        await db.query(`
          UPDATE economy SET balance = balance - ?
          WHERE user_id = (SELECT id FROM users WHERE discord_id=?)
        `, [amount, interaction.user.id]);

        await db.query('COMMIT');

        interaction.reply(`🚓 **Failed!** You lost ₹${amount}`);
      }
    } catch {
      await db.query('ROLLBACK');
      interaction.reply({ content: '❌ Robbery failed.', ephemeral: true });
    }
  }
};
