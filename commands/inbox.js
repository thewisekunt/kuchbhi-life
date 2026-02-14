const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inbox')
        .setDescription('📬 Check your latest anonymous messages'),

    async execute(interaction) {
        const safeReply = async (opts) => {
            if (interaction.deferred || interaction.replied) {
                return await interaction.editReply(opts);
            } else {
                return await interaction.reply(opts);
            }
        };

        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ ephemeral: true });
            }

            const [[user]] = await db.query('SELECT id FROM users WHERE discord_id = ?', [interaction.user.id]);
            if (!user) return safeReply({ content: "❌ User not found.", ephemeral: true });

            const messages = await db.query(`
                SELECT message, created_at FROM confessions 
                WHERE receiver_id = ? 
                ORDER BY created_at DESC LIMIT 5
            `, [user.id]);

            const msgs = messages[0];

            if (msgs.length === 0) {
                return safeReply({ 
                    content: "📭 Your inbox is empty. Share your link to get messages!", 
                    ephemeral: true 
                });
            }

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

            await safeReply({ embeds: [embed], ephemeral: true });

        } catch (err) {
            console.error(err);
            await safeReply({ content: "❌ Database error.", ephemeral: true });
        }
    }
};