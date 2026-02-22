const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('imposter')
    .setDescription('hello rahega'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🎮 Among Us Game')
      .setDescription('Click the button below to join the game!');

    const button = new ButtonBuilder()
      .setCustomId('join_imposter_game')
      .setLabel('Join the game')
      .setStyle(ButtonStyle.Primary);

    const removeButton = new ButtonBuilder()
      .setCustomId('leave_imposter_game')
      .setLabel('Leave the game')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder()
      .addComponents(button, removeButton);

    return interaction.editReply({ embeds: [embed], components: [row] });
  },

  async handleButtonClick(interaction) {
    if (interaction.customId === 'join_imposter_game') {
      try {
        // Get or create the 'impos' role
        let role = interaction.guild.roles.cache.find(r => r.name === 'impos');
        
        if (!role) {
          role = await interaction.guild.roles.create({
            name: 'impos',
            reason: 'Created for Among Us game',
          });
        }

        // Add role to user
        await interaction.member.roles.add(role);
        
        await interaction.reply({
          content: `✅ You've joined the game! You now have the **impos** role.`,
          ephemeral: true,
        });
      } catch (error) {
        console.error('Error adding role:', error);
        await interaction.reply({
          content: '❌ Failed to add role. Please try again.',
          ephemeral: true,
        });
      }
    } else if (interaction.customId === 'leave_imposter_game') {
      try {
        const role = interaction.guild.roles.cache.find(r => r.name === 'impos');
        
        if (!role) {
          return interaction.reply({
            content: '❌ The impos role does not exist.',
            ephemeral: true,
          });
        }

        if (!interaction.member.roles.cache.has(role.id)) {
          return interaction.reply({
            content: '❌ You don\'t have the **impos** role.',
            ephemeral: true,
          });
        }

        // Remove role from user
        await interaction.member.roles.remove(role);
        
        await interaction.reply({
          content: `✅ You've left the game! The **impos** role has been removed.`,
          ephemeral: true,
        });
      } catch (error) {
        console.error('Error removing role:', error);
        await interaction.reply({
          content: '❌ Failed to remove role. Please try again.',
          ephemeral: true,
        });
      }
    }
  },
};
