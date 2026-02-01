const { SlashCommandBuilder } = require('discord.js');
const db = require('../db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your balance')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('Check someone else’s balance')
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const target = interaction.options.getUser('user') || interaction.user;

    const [[row]] = await db.execute(`
      SELECT e.balance, e.lifetime_earned
      FROM users u
      LEFT JOIN economy e ON e.user_id = u.id
      WHERE u.discord_id = ?
    `, [target.id]);

    const balance = row?.balance ?? 0;
    const lifetime = row?.lifetime_earned ?? 0;

    await interaction.editReply(
      `💰 **${target.username}’s Balance**\n` +
      `₹${balance}\n\n` +
      `📈 Lifetime Earned: ₹${lifetime}`
    );
  }
};
