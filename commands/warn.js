const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Issue a formal warning to a member')
        .addUserOption(option => option.setName('target').setDescription('The member to warn').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for the warning').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async execute(interaction) {
        const target = interaction.options.getUser('target');
        const reason = interaction.options.getString('reason');

        if (target.bot) return interaction.reply({ content: "Bots cannot be warned.", flags: 64 });

        try {
            // Log to Database
            await db.execute(`
                INSERT INTO activity_log (discord_id, type, metadata) 
                VALUES (?, 'WARN', ?)
            `, [target.id, `Warned by ${interaction.user.username} for: ${reason}`]);

            const embed = new EmbedBuilder()
                .setTitle('⚠️ User Warned')
                .setDescription(`**Target:** <@${target.id}>\n**Reason:** ${reason}`)
                .setColor('#f1c40f')
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            
            // Try to DM the user
            try { await target.send(`⚠️ You have been warned in **Kuch Bhi** for: ${reason}`); } catch (e) {}

        } catch (err) {
            console.error(err);
            await interaction.reply({ content: '❌ Database error.', flags: 64 });
        }
    },
};