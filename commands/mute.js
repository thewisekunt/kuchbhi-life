const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Timeout a member (Standard Mute)')
        .addUserOption(option => option.setName('target').setDescription('The member to mute').setRequired(true))
        .addIntegerOption(option => option.setName('duration').setDescription('Minutes to mute').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for mute'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async execute(interaction) {
        const target = interaction.options.getMember('target');
        const minutes = interaction.options.getInteger('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        // Check if user still in server and if bot can actually mute them
        if (!target) return interaction.editReply({ content: "❌ Target member not found." });
        if (!target.moderatable) return interaction.editReply({ content: "❌ Target cannot be muted (Role Hierarchy issues)." });

        try {
            // Apply Discord Timeout
            await target.timeout(minutes * 60 * 1000, reason);

            // Log for Website
            await db.execute(`
                INSERT INTO activity_log (discord_id, type, metadata) 
                VALUES (?, 'MUTE', ?)
            `, [target.id, `MUTED (${minutes}m) by ${interaction.user.username} for: ${reason}`]);

            await interaction.editReply(`🔇 **${target.user.username}** muted for ${minutes} minutes. | Reason: ${reason}`);
        } catch (err) {
            console.error(err);
            await interaction.editReply({ content: '❌ Error applying timeout.' });
        }
    },
};
