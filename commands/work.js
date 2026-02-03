const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');
const cooldown = require('../cooldown');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Earn some money by doing odd jobs'),

    async execute(interaction) {
        const userId = interaction.user.id;
        
        // Use the self-cleaning cooldown utility (1 hour = 3600 seconds)
        const timeLeft = cooldown(`work_${userId}`, 3600);
        if (timeLeft > 0) {
            const minutes = (timeLeft / 60).toFixed(1);
            return interaction.editReply({ 
                content: `⚠️ Shanti rakho! You can work again in **${minutes} minutes**.` 
            });
        }

        const amount = Math.floor(Math.random() * 101) + 50; // ₹50 - ₹150
        const jobs = ['Cleaning the chat', 'Moderating voice channels', 'Helping new members', 'Fixing bot bugs'];
        const job = jobs[Math.floor(Math.random() * jobs.length)];

        try {
            // Optimization: Single trip query using SELECT sub-query inside INSERT
            await db.execute(`
                INSERT INTO economy (user_id, balance, lifetime_earned, updated_at)
                VALUES ((SELECT id FROM users WHERE discord_id = ? LIMIT 1), ?, ?, NOW())
                ON DUPLICATE KEY UPDATE 
                    balance = balance + VALUES(balance),
                    lifetime_earned = lifetime_earned + VALUES(lifetime_earned),
                    updated_at = NOW()
            `, [userId, amount, amount]);

            const embed = new EmbedBuilder()
                .setTitle('💼 Work Finished')
                .setDescription(`You worked as a **${job}** and earned **₹${amount}**!`)
                .setColor('#2ecc71')
                .setFooter({ text: 'Come back in 1 hour for more work' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error('Work Command Error:', err.message);
            return interaction.editReply({ content: '❌ Work failed due to a database error.' });
        }
    },
};