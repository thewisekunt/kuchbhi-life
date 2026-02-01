const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Bulk delete messages (Dyno style)')
        .addIntegerOption(option => 
            option.setName('amount')
                .setDescription('Number of messages to delete (1-100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages), // Mod only

    async execute(interaction) {
        const amount = interaction.options.getInteger('amount');
        
        // Bulk delete
        const deleted = await interaction.channel.bulkDelete(amount, true);

        return interaction.reply({ 
            content: `🧹 Swachh Bharat Abhiyan: **${deleted.size}** messages cleaned up!`, 
            flags: 64 // Ephemeral (only mod sees it)
        });
    },
};