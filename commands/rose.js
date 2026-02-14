const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rose')
        .setDescription('🌹 Send a Valentine Rose for ₹69')
        .addUserOption(option => 
            option.setName('user').setDescription('The lucky person').setRequired(true))
        .addStringOption(option => 
            option.setName('message').setDescription('A sweet note (optional)').setRequired(false))
        .addBooleanOption(option => 
            option.setName('anonymous').setDescription('Hide your name?').setRequired(false)),

    async execute(interaction) {
        // 1. SETUP
        const targetUser = interaction.options.getUser('user');
        const message = interaction.options.getString('message') || '';
        const isAnon = interaction.options.getBoolean('anonymous') || false;
        const cost = 69;

        if (targetUser.id === interaction.user.id) {
            return interaction.reply({ content: "🥀 You can't send a rose to yourself. Sad.", flags: 64 });
        }

        try {
            // 2. GET DATABASE IDs
            const [[sender]] = await db.query('SELECT id FROM users WHERE discord_id = ?', [interaction.user.id]);
            const [[receiver]] = await db.query('SELECT id FROM users WHERE discord_id = ?', [targetUser.id]);

            if (!sender || !receiver) {
                return interaction.reply({ content: "❌ Users not synced. Run a command or join the server.", flags: 64 });
            }

            // 3. CHECK BALANCE & TRANSACT
            const [[eco]] = await db.query('SELECT balance FROM economy WHERE user_id = ?', [sender.id]);
            
            if (!eco || eco.balance < cost) {
                return interaction.reply({ content: `💸 You are broke! You need **₹${cost}**.`, flags: 64 });
            }

            // Deduct & Insert
            await db.query('UPDATE economy SET balance = balance - ? WHERE user_id = ?', [cost, sender.id]);
            await db.query(
                'INSERT INTO valentine_gifts (sender_id, receiver_id, message, is_anonymous) VALUES (?, ?, ?, ?)',
                [sender.id, receiver.id, message, isAnon]
            );

            // 4. CONFIRMATION
            const embed = new EmbedBuilder()
                .setColor('#ff2a6d')
                .setTitle(isAnon ? '🕵️ Secret Rose Sent!' : '🌹 Rose Delivered!')
                .setDescription(`Successfully sent a rose to **${targetUser.username}** for ₹69.\nCheck the **Wall of Rizz** on the website!`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            // Optional: DM the receiver
            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor('#ff2a6d')
                    .setTitle('🌹 You received a Rose!')
                    .setDescription(isAnon 
                        ? `A **Secret Admirer** sent you a rose!` 
                        : `**${interaction.user.username}** sent you a rose!`)
                    .addFields({ name: 'Message', value: message || 'No message attached.' })
                    .setFooter({ text: 'Check the Wall of Rizz on kuchbhi.life' });
                
                await targetUser.send({ embeds: [dmEmbed] });
            } catch (e) {
                // DM failed (user has DMs off), ignore
            }

        } catch (err) {
            console.error(err);
            await interaction.reply({ content: "❌ Database error.", flags: 64 });
        }
    }
};