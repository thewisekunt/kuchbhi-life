const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('register')
        .setDescription('Join the waiting list to be ranked by Admins'),

    async execute(interaction) {
        try {
            // 1. Ensure user exists in 'users' table
            await db.execute(`
                INSERT INTO users (discord_id, username) 
                VALUES (?, ?) ON DUPLICATE KEY UPDATE username = VALUES(username)
            `, [interaction.user.id, interaction.user.username]);

            // 2. Insert into the CORRECT table: tier_game
            // tier_rank ko NULL chhod rahe hain kyunki Admin assign karega
            await db.execute(`
                INSERT INTO tier_game (user_id, status, created_at)
                VALUES (
                    (SELECT id FROM users WHERE discord_id = ?), 
                    'WAITING', 
                    NOW()
                )
                ON DUPLICATE KEY UPDATE 
                    status = 'WAITING',
                    created_at = NOW()
            `, [interaction.user.id]);

            const embed = new EmbedBuilder()
                .setTitle('📥 Added to Pool')
                .setDescription('You have successfully joined the waiting list.')
                .addFields({ name: 'Status', value: '⏳ WAITING' })
                .setColor('#3498db')
                .setFooter({ text: 'Admins will rank you from the web dashboard.' });

            return interaction.reply({ embeds: [embed] });

        } catch (err) {
            console.error('Registration Error:', err);
            return interaction.reply({ content: '❌ Error joining the pool. Check console.', flags: 64 });
        }
    }
};