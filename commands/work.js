const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');
const cooldown = require('../cooldown');
const ensureUser = require('../utils/ensureUser');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('Earn some money by doing odd jobs'),

  async execute(interaction) {
    const user = interaction.user;

    // Ensure user + economy row exist
    await ensureUser(user);

    // Cooldown: 1 hour (3600 seconds)
    const timeLeft = cooldown(`work_${user.id}`, 3600);
    if (timeLeft > 0) {
      const minutes = (timeLeft / 60).toFixed(1);
      return interaction.editReply(
        `⚠️ Shanti rakho! You can work again in **${minutes} minutes**.`
      );
    }

    const amount = Math.floor(Math.random() * 101) + 50; // ₹50–₹150
    const jobs = [
      'Cleaning the chat',
      'Moderating voice channels',
      'Helping new members',
      'Fixing bot bugs'
    ];
    const job = jobs[Math.floor(Math.random() * jobs.length)];

    try {
      await db.execute(
        `
        UPDATE economy
        SET balance = balance + ?,
            lifetime_earned = lifetime_earned + ?,
            updated_at = NOW()
        WHERE user_id = (
          SELECT id FROM users WHERE discord_id = ? LIMIT 1
        )
        `,
        [amount, amount, user.id]
      );

      const embed = new EmbedBuilder()
        .setTitle('💼 Work Finished')
        .setDescription(
          `You worked as a **${job}** and earned **₹${amount}**!`
        )
        .setColor('#2ecc71')
        .setFooter({ text: 'Come back in 1 hour for more work' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('Work Command Error:', err);
      return interaction.editReply(
        '❌ Work failed due to a database error.'
      );
    }
  }
};
