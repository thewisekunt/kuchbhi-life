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
        const targetUser = interaction.options.getUser('user');
        const message = interaction.options.getString('message');

        if (message.length > 500) {
            return interaction.reply({ content: "❌ Message too long (Max 500 chars).", flags: 64 });
        }

        try {
            // 1. Get Receiver DB ID
            const [[receiver]] = await db.query('SELECT id FROM users WHERE discord_id = ?', [targetUser.id]);

            if (!receiver) {
                return interaction.reply({ content: "❌ This user hasn't registered on the site yet.", flags: 64 });
            }

            // 2. Insert Confession
            await db.query(
                'INSERT INTO confessions (receiver_id, message) VALUES (?, ?)',
                [receiver.id, message]
            );

            // 3. Confirm
            await interaction.reply({ 
                content: `✅ **Sent anonymously** to ${targetUser.username}'s Secret Inbox!`, 
                flags: 64 
            });

            // 4. Notify Receiver (Privately)
            try {
                const alertEmbed = new EmbedBuilder()
                    .setColor('#aeb4fa')
                    .setTitle('🤫 New Secret Message!')
                    .setDescription('Someone just sent you an anonymous confession.')
                    .addFields({ name: 'Preview', value: '||' + message + '||' }) // Spoiler tag
                    .setFooter({ text: 'View full inbox at kuchbhi.life/inbox.php' });

                await targetUser.send({ embeds: [alertEmbed] });
            } catch (e) {
                // DMs closed
            }

        } catch (err) {
            console.error(err);
            await interaction.reply({ content: "❌ Database error.", flags: 64 });
        }
    }
};