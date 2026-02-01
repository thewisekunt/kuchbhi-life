const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your current balance'),

    async execute(interaction) {
        const [rows] = await db.execute(`
            SELECT balance FROM economy 
            WHERE user_id = (SELECT id FROM users WHERE discord_id = ?)
        `, [interaction.user.id]);

        const balance = rows[0] ? rows[0].balance : 0;

        const embed = new EmbedBuilder()
            .setTitle('💰 Your Wallet')
            .setDescription(`**Balance:** ₹${balance.toLocaleString()}`)
            .setColor('#f1c40f');

        return interaction.reply({ embeds: [embed] });
    },
};