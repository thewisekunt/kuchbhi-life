const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slut')
        .setDescription('High risk, high reward. Can you handle the streets?'),

    async execute(interaction) {
        const isWin = Math.random() > 0.5; // 50/50 chance
        const amount = Math.floor(Math.random() * 300) + 50; // ₹50 - ₹350

        try {
            if (isWin) {
                await db.execute(`UPDATE economy SET balance = balance + ? WHERE user_id = (SELECT id FROM users WHERE discord_id = ?)`, [amount, interaction.user.id]);
                
                const embed = new EmbedBuilder()
                    .setTitle('💸 Success!')
                    .setDescription(`You went out and came back with **₹${amount}**!`)
                    .setColor('#2ecc71');
                return interaction.reply({ embeds: [embed] });
            } else {
                await db.execute(`UPDATE economy SET balance = GREATEST(0, balance - ?) WHERE user_id = (SELECT id FROM users WHERE discord_id = ?)`, [amount, interaction.user.id]);
                
                const embed = new EmbedBuilder()
                    .setTitle('👮 Busted!')
                    .setDescription(`The cops caught you. You lost **₹${amount}** in fines.`)
                    .setColor('#e74c3c');
                return interaction.reply({ embeds: [embed] });
            }
        } catch (e) { console.error(e); }
    }
};