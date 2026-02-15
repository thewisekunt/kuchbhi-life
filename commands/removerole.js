const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removerole')
        .setDescription('➖ Remove a role from a user')
        .addUserOption(option => 
            option.setName('user').setDescription('The user').setRequired(true))
        .addRoleOption(option => 
            option.setName('role').setDescription('The role to remove').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    async execute(interaction) {
        const user = interaction.options.getMember('user');
        const role = interaction.options.getRole('role');

        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({ content: "❌ I don't have permission to manage roles!", ephemeral: true });
        }
        
        if (role.position >= interaction.guild.members.me.roles.highest.position) {
            return interaction.reply({ content: "❌ I cannot remove this role because it is higher than mine.", ephemeral: true });
        }

        try {
            await user.roles.remove(role);
            await interaction.reply({ content: `✅ Removed **${role.name}** from **${user.user.username}**.` });
        } catch (err) {
            console.error(err);
            await interaction.reply({ content: "❌ Failed to remove role.", ephemeral: true });
        }
    }
};