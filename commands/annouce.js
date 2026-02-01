const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    PermissionFlagsBits, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder 
} = require('discord.js');
const db = require('../db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Create a new announcement for the website and Discord')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('announcement_modal')
            .setTitle('Create New Announcement');

        const titleInput = new TextInputBuilder()
            .setCustomId('ann_title')
            .setLabel("Title")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter a catchy title...')
            .setRequired(true);

        const badgeInput = new TextInputBuilder()
            .setCustomId('ann_badge')
            .setLabel("Badge (INFO, UPDATE, IMPORTANT)")
            .setStyle(TextInputStyle.Short)
            .setValue('INFO')
            .setRequired(true);

        const bodyInput = new TextInputBuilder()
            .setCustomId('ann_body')
            .setLabel("Content")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Write your announcement here...')
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(badgeInput),
            new ActionRowBuilder().addComponents(bodyInput)
        );

        await interaction.showModal(modal);
    },
};