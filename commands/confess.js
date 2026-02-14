const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('confess')
        .setDescription('🤫 Send an anonymous message to someone\'s inbox')
        .addUserOption(option => 
            option.setName('user').setDescription('Who is this for?').setRequired(true))
        .addStringOption(option => 
            option.setName('message').setDescription('Your secret message').setRequired(true)),

    async execute(interaction) {
        // --- HELPER: SAFE REPLY ---
        const safeReply = async (opts) => {
            if (interaction.deferred || interaction.replied) {
                return await interaction.editReply(opts);
            } else {
                return await interaction.reply(opts);
            }
        };

        const targetUser = interaction.options.getUser('user');
        const message = interaction.options.getString('message');

        if (message.length > 500) {
            return safeReply({ content: "❌ Message too long (Max 500 chars).", ephemeral: true });
        }

        try {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ ephemeral: true });
            }

            const [[receiver]] = await db.query('SELECT id FROM users WHERE discord_id = ?', [targetUser.id]);

            if (!receiver) {
                return safeReply({ content: "❌ This user hasn't registered on the site yet.", ephemeral: true });
            }

            await db.query(
                'INSERT INTO confessions (receiver_id, message) VALUES (?, ?)',
                [receiver.id, message]
            );

            await safeReply({ 
                content: `✅ **Sent anonymously** to ${targetUser.username}'s Secret Inbox!`, 
                ephemeral: true 
            });

            try {
                const alertEmbed = new EmbedBuilder()
                    .setColor('#aeb4fa')
                    .setTitle('🤫 New Secret Message!')
                    .setDescription('Someone just sent you an anonymous confession.')
                    .addFields({ name: 'Preview', value: '||' + message + '||' }) 
                    .setFooter({ text: 'View full inbox at kuchbhi.life/inbox.php' });

                await targetUser.send({ embeds: [alertEmbed] });
            } catch (e) {}

        } catch (err) {
            console.error(err);
            await safeReply({ content: "❌ Database error.", ephemeral: true });
        }
    }
};