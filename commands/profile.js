const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');
const ensureUser = require('../utils/ensureUser');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Show your server profile and stats')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('The user to view')
    ),

  async execute(interaction) {
    const target =
      interaction.options.getUser('target') || interaction.user;

    // Ensure user exists (safe even for viewing others)
    await ensureUser(target);

    const query = `
      SELECT 
        u.id,
        u.username,

        -- Economy
        COALESCE(e.balance, 0) AS balance,
        COALESCE(e.event_points, 0) AS event_points,

        -- Stats
        COALESCE(s.message_count, 0) AS message_count,
        COALESCE(s.voice_minutes, 0) AS voice_minutes,

        -- Tier game
        t.tier_rank,
        t.status AS tier_status,

        -- Social (private logs, public counts)
        (SELECT COUNT(*) FROM slap_logs WHERE target_id = u.id) AS slaps_received,
        (SELECT COUNT(*) FROM kudos_logs WHERE receiver_id = u.id) AS kudos_received

      FROM users u
      LEFT JOIN economy e ON e.user_id = u.id
      LEFT JOIN user_stats s ON s.user_id = u.id
      LEFT JOIN tier_game t ON t.user_id = u.id
      WHERE u.discord_id = ?
      LIMIT 1
    `;

    try {
      const [[data]] = await db.execute(query, [target.id]);

      if (!data) {
        return interaction.editReply(
          '❌ User data not found in the database.'
        );
      }

      const hours = Math.floor(data.voice_minutes / 60);
      const minutes = data.voice_minutes % 60;

      const embed = new EmbedBuilder()
        .setAuthor({
          name: `${target.username}'s Profile`,
          iconURL: target.displayAvatarURL()
        })
        .setThumbnail(target.displayAvatarURL())
        .addFields(
          {
            name: '💰 Economy',
            value:
              `Balance: ₹${data.balance.toLocaleString()}\n` +
              `Points: ${data.event_points} PTS`,
            inline: true
          },
          {
            name: '📊 Stats',
            value:
              `Messages: ${data.message_count}\n` +
              `Voice: ${hours}h ${minutes}m`,
            inline: true
          },
          {
            name: '👋 Social',
            value:
              `Slaps Received: ${data.slaps_received}\n` +
              `Kudos Earned: ❤️ ${data.kudos_received}`,
            inline: true
          },
          {
            name: '🎮 Tier Game',
            value:
              `Rank: **${data.tier_rank || 'N/A'}**\n` +
              `Status: ${data.tier_status || 'NOT JOINED'}`,
            inline: false
          }
        )
        .setColor('#3498db')
        .setTimestamp()
        .setFooter({ text: `User ID: ${target.id}` });

      return interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('Profile Command Error:', err);
      return interaction.editReply(
        '❌ Error fetching profile data.'
      );
    }
  }
};
