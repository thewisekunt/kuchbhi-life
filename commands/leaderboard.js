const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('🏆 View the top 10 leaderboards for the server')
    .addStringOption(option =>
      option.setName('category')
        .setDescription('Which leaderboard do you want to view?')
        .setRequired(true)
        .addChoices(
          { name: '💰 Economy (Richest)', value: 'economy' },
          { name: '🎙️ Voice Activity', value: 'voice' },
          { name: '💬 Text Activity', value: 'text' },
          { name: '🏆 Awards Won', value: 'awards' },
          { name: '⭐ Starboard (Most Stars)', value: 'starboard' },
          { name: '👋 Most Slapped', value: 'slaps' },
          { name: '❤️ Most Kudos', value: 'kudos' }
        )
    ),

  async execute(interaction) {
    // Removed the deferReply here because your index.js automatically does it!
    
    const category = interaction.options.getString('category');
    let query = '';
    let title = '';
    let color = '#3498db';
    let data = [];

    try {
      switch (category) {
        case 'economy':
          title = '💰 Top 10 Richest Members';
          color = '#f1c40f'; // Gold
          query = `
            SELECT u.username, e.balance as score 
            FROM economy e 
            JOIN users u ON e.user_id = u.id 
            ORDER BY e.balance DESC 
            LIMIT 10
          `;
          [data] = await db.query(query);
          data = data.map(d => ({ name: d.username, value: `₹${d.score.toLocaleString()}` }));
          break;

        case 'voice':
          title = '🎙️ Top 10 Voice Yappers';
          color = '#2ecc71'; // Green
          query = `
            SELECT u.username, s.voice_minutes as score 
            FROM user_stats s 
            JOIN users u ON s.user_id = u.id 
            ORDER BY s.voice_minutes DESC 
            LIMIT 10
          `;
          [data] = await db.query(query);
          data = data.map(d => {
            const hrs = Math.floor(d.score / 60);
            const mins = d.score % 60;
            return { name: d.username, value: `${hrs}h ${mins}m` };
          });
          break;

        case 'text':
          title = '💬 Top 10 Text Chatters';
          color = '#3498db'; // Blue
          query = `
            SELECT u.username, s.message_count as score 
            FROM user_stats s 
            JOIN users u ON s.user_id = u.id 
            ORDER BY s.message_count DESC 
            LIMIT 10
          `;
          [data] = await db.query(query);
          data = data.map(d => ({ name: d.username, value: `${d.score.toLocaleString()} messages` }));
          break;

        case 'slaps':
          title = '👋 Most Slapped Members';
          color = '#e74c3c'; // Red
          query = `
            SELECT u.username, COUNT(s.id) as score 
            FROM slap_logs s 
            JOIN users u ON s.target_id = u.id 
            GROUP BY u.id 
            ORDER BY score DESC 
            LIMIT 10
          `;
          [data] = await db.query(query);
          data = data.map(d => ({ name: d.username, value: `${d.score} Slaps` }));
          break;

        case 'kudos':
          title = '❤️ Most Loved Members (Kudos)';
          color = '#e91e63'; // Pink
          query = `
            SELECT u.username, COUNT(k.id) as score 
            FROM kudos_logs k 
            JOIN users u ON k.receiver_id = u.id 
            GROUP BY u.id 
            ORDER BY score DESC 
            LIMIT 10
          `;
          [data] = await db.query(query);
          data = data.map(d => ({ name: d.username, value: `${d.score} Kudos` }));
          break;

        case 'starboard':
          title = '⭐ Most Starred Members';
          color = '#f1c40f'; // Gold
          query = `
            SELECT u.username, SUM(st.star_count) as score 
            FROM starboard st 
            JOIN users u ON st.user_id = u.id 
            GROUP BY u.id 
            ORDER BY score DESC 
            LIMIT 10
          `;
          [data] = await db.query(query);
          data = data.map(d => ({ name: d.username, value: `${d.score || 0} Total Stars` }));
          break;

        case 'awards':
          title = '🏆 Most Awards Won';
          color = '#ffd700'; // Pure Gold
          
          // Custom logic for awards to handle ties and duos securely
          const awardQuery = `
            SELECT n.category_id, 
                   u1.username as u1_name, 
                   u2.username as u2_name, 
                   (SELECT COUNT(*) FROM award_votes v WHERE v.category_id = n.category_id AND v.nominee_id = n.user_id) as vote_count
            FROM award_nominees n
            JOIN award_categories c ON c.id = n.category_id
            JOIN users u1 ON n.user_id = u1.id
            LEFT JOIN users u2 ON n.user2_id = u2.id
            WHERE c.is_open = 0
            ORDER BY n.category_id ASC, vote_count DESC
          `;
          
          const [noms] = await db.execute(awardQuery);
          const catMap = {};
          
          // Group by category and find max votes (tie detection)
          for (const nom of noms) {
            if (!catMap[nom.category_id]) {
              catMap[nom.category_id] = { max: nom.vote_count, winners: [] };
            }
            if (nom.vote_count === catMap[nom.category_id].max && nom.vote_count > 0) {
              catMap[nom.category_id].winners.push(nom);
            }
          }

          // Count up the trophies!
          const winCounts = {};
          for (const catId in catMap) {
            for (const win of catMap[catId].winners) {
              winCounts[win.u1_name] = (winCounts[win.u1_name] || 0) + 1;
              if (win.u2_name) winCounts[win.u2_name] = (winCounts[win.u2_name] || 0) + 1;
            }
          }

          // Sort and format top 10
          const sortedAwards = Object.entries(winCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
          
          data = sortedAwards.map(a => ({ name: a[0], value: `${a[1]} Trophies 🏆` }));
          break;
      }

      // ==========================================
      // BUILD THE EMBED
      // ==========================================
      const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(color)
        .setTimestamp()
        .setFooter({ text: 'Kuch Bhi Server Leaderboards' });

      if (data.length === 0) {
        embed.setDescription('*No data available for this leaderboard yet.*');
      } else {
        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        let description = '';

        data.forEach((row, index) => {
          description += `${medals[index]} **${row.name}** — ${row.value}\n\n`;
        });

        embed.setDescription(description);
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error(`Leaderboard Error [${category}]:`, err);
      await interaction.editReply('❌ Failed to fetch the leaderboard. Please try again later.');
    }
  }
};
