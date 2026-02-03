const { 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle, 
    ActionRowBuilder 
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Create a new announcement')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction) {
        // 💡 IMPORTANT: Modals cannot be shown if the interaction is deferred.
        // If your index.js defers everything, you must exclude 'announce' from global defer.
        
        const modal = new ModalBuilder()
            .setCustomId('announcement_modal')
            .setTitle('Create New Announcement');

        const titleInput = new TextInputBuilder()
            .setCustomId('ann_title')
            .setLabel("Title")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter title...')
            .setRequired(true);

        const badgeInput = new TextInputBuilder()
            .setCustomId('ann_badge')
            .setLabel("Badge (e.g., INFO, UPDATE)")
            .setStyle(TextInputStyle.Short)
            .setValue('INFO')
            .setRequired(true);

        const bodyInput = new TextInputBuilder()
            .setCustomId('ann_body')
            .setLabel("Content")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder('Write content here...')
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(titleInput),
            new ActionRowBuilder().addComponents(badgeInput),
            new ActionRowBuilder().addComponents(bodyInput)
        );

        await interaction.showModal(modal);
    },
};