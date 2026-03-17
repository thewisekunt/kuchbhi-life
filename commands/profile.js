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

      // ==========================================
      // FETCH AWARDS LOGIC (WITH TIE SUPPORT)
      // ==========================================
      
      const awardQuery = `
        SELECT n.category_id, c.title AS category_title, n.user_id, n.user2_id,
               (SELECT COUNT(*) FROM award_votes v WHERE v.category_id = n.category_id AND v.nominee_id = n.user_id) as vote_count
        FROM award_nominees n
        JOIN award_categories c ON c.id = n.category_id
        WHERE c.is_open = 0
        ORDER BY n.category_id ASC, vote_count DESC
      `;
      
      const [allNominees] = await db.execute(awardQuery);
      
      // Group by category to find the winner(s)
      const categoryData = {};
      for (const nom of allNominees) {
        if (!categoryData[nom.category_id]) {
          // First one we see for this category sets the max votes
          if (nom.vote_count > 0) {
            categoryData[nom.category_id] = { maxVotes: nom.vote_count, winners: [nom] };
          } else {
             // Nobody voted
            categoryData[nom.category_id] = { maxVotes: 0, winners: [] };
          }
        } else if (nom.vote_count === categoryData[nom.category_id].maxVotes && nom.vote_count > 0) {
          // It's a tie! Add them to the winners array
          categoryData[nom.category_id].winners.push(nom);
        }
      }

      // Flatten the winners into one big array to easily filter
      let winningNominations = [];
      for (const cat in categoryData) {
        winningNominations.push(...categoryData[cat].winners);
      }

      // Check if our target user is the primary user or the duo partner in ANY winning entries
      const myAwards = winningNominations.filter(
        win => win.user_id === data.id || win.user2_id === data.id
      );

      const awardsText = myAwards.length > 0 
        ? myAwards.map(a => `🏆 **${a.category_title}**`).join('\n')
        : '*No awards won yet.*';

      // ==========================================

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
            name: '🏆 Awards Won',
            value: awardsText,
            inline: true
          },
          {
            name: '🎮 Tier Game',
            value:
              `Rank: **${data.tier_rank || 'N/A'}**\n` +
              `Status: ${data.tier_status || 'NOT JOINED'}`,
            inline: true
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
