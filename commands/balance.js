const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');
const ensureUser = require('../utils/ensureUser');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your current balance or another user’s balance')
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('The user whose balance you want to check')
    ),

  async execute(interaction) {
    const targetUser =
      interaction.options.getUser('user') || interaction.user;

    // Ensure target user exists (safe even for viewing others)
    await ensureUser(targetUser);

    try {
      const [[row]] = await db.execute(
        `
        SELECT
          e.balance,
          e.lifetime_earned
        FROM users u
        LEFT JOIN economy e ON e.user_id = u.id
        WHERE u.discord_id = ?
        LIMIT 1
        `,
        [targetUser.id]
      );

      const balance = row?.balance ?? 0;
      const lifetime = row?.lifetime_earned ?? 0;

      const embed = new EmbedBuilder()
        .setTitle(`💰 ${targetUser.username}’s Wallet`)
        .addFields(
          {
            name: 'Current Balance',
            value: `₹${balance.toLocaleString()}`,
            inline: true
          },
          {
            name: 'Lifetime Earned',
            value: `₹${lifetime.toLocaleString()}`,
            inline: true
          }
        )
        .setColor('#f1c40f')
        .setThumbnail(targetUser.displayAvatarURL())
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('Balance Command Error:', err);
      return interaction.editReply(
        '❌ Could not retrieve balance data.'
      );
    }
  }
};
