const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addrole')
        .setDescription('➕ Give a role to a user')
        .addUserOption(option => 
            option.setName('user').setDescription('The user').setRequired(true))
        .addRoleOption(option => 
            option.setName('role').setDescription('The role to add').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles), // Only people with Manage Roles

    async execute(interaction) {
        const user = interaction.options.getMember('user');
        const role = interaction.options.getRole('role');

        // Safety Checks
        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
            return interaction.reply({ content: "❌ I don't have permission to manage roles!", ephemeral: true });
        }
        
        if (role.position >= interaction.guild.members.me.roles.highest.position) {
            return interaction.reply({ content: "❌ I cannot add this role because it is higher than my highest role.", ephemeral: true });
        }

        try {
            await user.roles.add(role);
            await interaction.reply({ content: `✅ Added **${role.name}** to **${user.user.username}**.` });
        } catch (err) {
            console.error(err);
            await interaction.reply({ content: "❌ Failed to add role. Check my permissions hierarchy.", ephemeral: true });
        }
    }
};