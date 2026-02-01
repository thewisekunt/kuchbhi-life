const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a member from the server')
        .addUserOption(option => option.setName('target').setDescription('The member to ban').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for ban'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    async execute(interaction) {
        const target = interaction.options.getMember('target');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!target) return interaction.reply({ content: "User not found in this server.", flags: 64 });
        if (!target.bannable) return interaction.reply({ content: "❌ Hierarchy Error: Target has a higher role.", flags: 64 });

        try {
            await target.ban({ reason: `Banned by ${interaction.user.username}: ${reason}` });
            
            // Log for Website
            await db.execute(`
                INSERT INTO activity_log (discord_id, type, metadata) 
                VALUES (?, 'BAN', ?)
            `, [target.id, `BANNED by ${interaction.user.username} for: ${reason}`]);

            await interaction.reply(`✈️ **${target.user.username}** has been banned. | Reason: ${reason}`);
        } catch (err) {
            console.error(err);
            await interaction.reply({ content: '❌ Action failed.', flags: 64 });
        }
    },
};
