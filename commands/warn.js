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
        const targetUser = interaction.options.getUser('target');
        const targetMember = interaction.options.getMember('target');
        const reason = interaction.options.getString('reason');

        if (targetUser.bot) return interaction.editReply({ content: "Bots cannot be warned." });

        try {
            // Log to Database
            await db.execute(`
                INSERT INTO activity_log (discord_id, type, metadata) 
                VALUES (?, 'WARN', ?)
            `, [targetUser.id, `Warned by ${interaction.user.username} for: ${reason}`]);

            const embed = new EmbedBuilder()
                .setTitle('⚠️ User Warned')
                .setDescription(`**Target:** <@${targetUser.id}>\n**Reason:** ${reason}`)
                .setColor('#f1c40f')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            
            // Try to DM the user (Silent fail if DMs are off)
            try { 
                await targetUser.send(`⚠️ You have been warned in **Kuch Bhi** for: ${reason}`); 
            } catch (e) {
                console.log(`Could not DM user ${targetUser.tag}`);
            }

        } catch (err) {
            console.error(err);
            await interaction.editReply({ content: '❌ Database error.' });
        }
    },
};
