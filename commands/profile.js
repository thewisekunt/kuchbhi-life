const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('Show your server profile and stats')
        .addUserOption(option => option.setName('target').setDescription('The user to view')),

    async execute(interaction) {
        const target = interaction.options.getUser('target') || interaction.user;

        const query = `
            SELECT 
                u.id, u.username, 
                e.balance, e.event_points,
                s.message_count, s.voice_minutes,
                t.tier_rank, t.status as tier_status,
                (SELECT COUNT(*) FROM slap_logs WHERE target_id = u.id) as slaps_received,
                (SELECT COUNT(*) FROM kudos_logs WHERE receiver_id = u.id) as kudos_received
            FROM users u
            LEFT JOIN economy e ON u.id = e.user_id
            LEFT JOIN user_stats s ON u.id = s.user_id
            LEFT JOIN tier_game t ON u.id = t.user_id
            WHERE u.discord_id = ?
        `;

        try {
            const [rows] = await db.execute(query, [target.id]);
            
            if (!rows[0]) {
                return interaction.reply({ content: '❌ User data not found in database.', flags: 64 });
            }

            const data = rows[0];
            const h = Math.floor((data.voice_minutes || 0) / 60);
            const m = (data.voice_minutes || 0) % 60;

            const embed = new EmbedBuilder()
                .setAuthor({ name: `${target.username}'s Profile`, iconURL: target.displayAvatarURL() })
                .setThumbnail(target.displayAvatarURL())
                .addFields(
                    { name: '💰 Economy', value: `Balance: ₹${(data.balance || 0).toLocaleString()}\nPoints: ${data.event_points || 0} PTS`, inline: true },
                    { name: '📊 Stats', value: `Messages: ${data.message_count || 0}\nVoice: ${h}h ${m}m`, inline: true },
                    { name: '👋 Social', value: `Slaps Received: ${data.slaps_received || 0}\nKudos Earned: ❤️ ${data.kudos_received || 0}`, inline: true },
                    { name: '🎮 Tier Game', value: `Rank: **${data.tier_rank || 'N/A'}**\nStatus: ${data.tier_status || 'NOT JOINED'}`, inline: false }
                )
                .setColor('#3498db')
                .setTimestamp()
                .setFooter({ text: `User ID: ${target.id}` });

            return interaction.reply({ embeds: [embed] });

        } catch (err) {
            console.error('Profile Command Error:', err);
            return interaction.reply({ content: '❌ Error fetching profile data.', flags: 64 });
        }
    },
};