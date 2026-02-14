const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inbox')
        .setDescription('📬 Check your latest anonymous messages'),

    async execute(interaction) {
        try {
            // 1. Get User
            const [[user]] = await db.query('SELECT id FROM users WHERE discord_id = ?', [interaction.user.id]);
            if (!user) return interaction.reply({ content: "❌ User not found.", flags: 64 });

            // 2. Fetch Last 5 Messages
            const messages = await db.query(`
                SELECT message, created_at FROM confessions 
                WHERE receiver_id = ? 
                ORDER BY created_at DESC LIMIT 5
            `, [user.id]);

            // NOTE: db.query returns [rows, fields], so we take messages[0]
            const msgs = messages[0];

            if (msgs.length === 0) {
                return interaction.reply({ 
                    content: "📭 Your inbox is empty. Share your link to get messages!", 
                    flags: 64 
                });
            }

            // 3. Build Embed
            const embed = new EmbedBuilder()
                .setColor('#000000')
                .setTitle('🤫 Your Secret Inbox (Last 5)')
                .setDescription(`View all at: https://kuchbhi.life/inbox.php`)
                .setFooter({ text: 'Only you can see this.' });

            msgs.forEach((msg, i) => {
                const date = new Date(msg.created_at).toLocaleDateString();
                embed.addFields({ 
                    name: `Message #${i + 1} (${date})`, 
                    value: `> ${msg.message}` 
                });
            });

            await interaction.reply({ embeds: [embed], flags: 64 });

        } catch (err) {
            console.error(err);
            await interaction.reply({ content: "❌ Database error.", flags: 64 });
        }
    }
};