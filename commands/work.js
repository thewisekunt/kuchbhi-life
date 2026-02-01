const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');

const cooldowns = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Earn some money by doing odd jobs'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const now = Date.now();
        const cooldownAmount = 60 * 60 * 1000; // 1 Hour

        if (cooldowns.has(userId)) {
            const expirationTime = cooldowns.get(userId) + cooldownAmount;
            if (now < expirationTime) {
                const timeLeft = (expirationTime - now) / 1000 / 60;
                return interaction.reply({ content: `⚠️ Shanti rakho! You can work again in ${timeLeft.toFixed(1)} minutes.`, flags: 64 });
            }
        }

        const amount = Math.floor(Math.random() * 101) + 50; // ₹50 - ₹150
        const jobs = ['Cleaning the chat', 'Moderating voice channels', 'Helping new members', 'Fixing bot bugs'];
        const job = jobs[Math.floor(Math.random() * jobs.length)];

        try {
            await db.execute(`
                INSERT INTO economy (user_id, balance, lifetime_earned, updated_at)
                VALUES ((SELECT id FROM users WHERE discord_id = ?), ?, ?, NOW())
                ON DUPLICATE KEY UPDATE 
                    balance = balance + VALUES(balance),
                    lifetime_earned = lifetime_earned + VALUES(lifetime_earned),
                    updated_at = NOW()
            `, [userId, amount, amount]);

            cooldowns.set(userId, now);

            const embed = new EmbedBuilder()
                .setTitle('💼 Work Finished')
                .setDescription(`You worked as a **${job}** and earned **₹${amount}**!`)
                .setColor('#2ecc71')
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            return interaction.reply({ content: '❌ Work failed. Try again later.', flags: 64 });
        }
    },
};