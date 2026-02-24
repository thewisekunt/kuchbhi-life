const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gamemaster')
    .setDescription('Open game master panel to send questions'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🎮 Game Master Panel')
      .setDescription('Click the buttons below to manage the game');

    const openQuestionsButton = new ButtonBuilder()
      .setCustomId('open_questions_modal')
      .setLabel('Open Questions Form')
      .setStyle(ButtonStyle.Primary);

    const startGameButton = new ButtonBuilder()
      .setCustomId('start_game')
      .setLabel('Start Game')
      .setStyle(ButtonStyle.Success);

    const endGameButton = new ButtonBuilder()
      .setCustomId('end_game')
      .setLabel('End Game')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(openQuestionsButton, startGameButton, endGameButton);

    return interaction.editReply({
      embeds: [embed],
      components: [row],
    });
  },

  async handleButtonClick(interaction) {
    if (interaction.customId === 'open_questions_modal') {
      const modal = new ModalBuilder()
        .setCustomId('game_questions_modal')
        .setTitle('Game Questions');

      const generalQuestion = new TextInputBuilder()
        .setCustomId('general_question')
        .setLabel('General Question')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter a question for all players')
        .setRequired(true);

      const imposterQuestion = new TextInputBuilder()
        .setCustomId('imposter_question')
        .setLabel('Imposter Question')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter a question for the imposter only')
        .setRequired(true);

      const row1 = new ActionRowBuilder().addComponents(generalQuestion);
      const row2 = new ActionRowBuilder().addComponents(imposterQuestion);

      modal.addComponents(row1, row2);
      await interaction.showModal(modal);
    } else if (interaction.customId === 'start_game') {
      try {
        const imposRole = interaction.guild.roles.cache.find(r => r.name === 'impos');
        
        if (!imposRole || imposRole.members.size === 0) {
          return interaction.reply({
            content: '❌ No members with the impos role found. No game to start!',
            ephemeral: true,
          });
        }

        const membersWithRole = Array.from(imposRole.members.values());
        const membersList = membersWithRole.map(member => `• ${member.user.username}`).join('\n');

        const embed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('🎮 Game Started!')
          .setDescription(`**Players in the game:**\n${membersList}`)
          .setFooter({ text: `Total players: ${membersWithRole.length}` })
          .setTimestamp();

        await interaction.reply({
          embeds: [embed],
          ephemeral: false,
        });

        // Wait 15 seconds then ping the impos role
        setTimeout(async () => {
          try {
            await interaction.channel.send({
              content: `<@&${imposRole.id}> Write your answers according to your question`,
              allowedMentions: { parse: ['roles'] }
            });
          } catch (error) {
            console.error('Error sending ping message:', error);
          }
        }, 15000);
      } catch (error) {
        console.error('Error starting game:', error);
        await interaction.reply({
          content: '❌ Failed to start the game. Please try again.',
          ephemeral: true,
        });
      }
    } else if (interaction.customId === 'end_game') {
      try {
        const imposRole = interaction.guild.roles.cache.find(r => r.name === 'impos');
        
        if (!imposRole) {
          return interaction.reply({
            content: '❌ The impos role does not exist.',
            ephemeral: true,
          });
        }

        if (imposRole.members.size === 0) {
          return interaction.reply({
            content: '❌ No members with the impos role found. No game to end!',
            ephemeral: true,
          });
        }

        const membersWithRole = Array.from(imposRole.members.values());

        // Remove role from all members
        for (const member of membersWithRole) {
          try {
            await member.roles.remove(imposRole);
          } catch (error) {
            console.error(`Failed to remove role from ${member.user.username}:`, error);
          }
        }

        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('🎮 Game Ended')
          .setDescription(`**Game has ended!**\n\nRemoved the impos role from ${membersWithRole.length} player(s).`)
          .setTimestamp();

        await interaction.reply({
          embeds: [embed],
          ephemeral: false,
        });
      } catch (error) {
        console.error('Error ending game:', error);
        await interaction.reply({
          content: '❌ Failed to end the game. Please try again.',
          ephemeral: true,
        });
      }
    }
  },

  async handleModalSubmit(interaction) {
  const generalQuestion = interaction.fields.getTextInputValue('general_question');
  const imposterQuestion = interaction.fields.getTextInputValue('imposter_question');

  try {
    // Defer the reply first
    await interaction.deferReply({ ephemeral: true });

    // Get all members with impos role
    const imposRole = interaction.guild.roles.cache.find(r => r.name === 'impos');
    
    if (!imposRole || imposRole.members.size === 0) {
      return interaction.editReply({
        content: '❌ No members with the impos role found.',
      });
    }

    const membersWithRole = Array.from(imposRole.members.values());
    
    // Pick a random imposter
    const randomImposter = membersWithRole[Math.floor(Math.random() * membersWithRole.length)];

    // Send general question to all members EXCEPT the imposter
    const generalEmbed = new EmbedBuilder()
      .setColor('#575757')
      .setTitle('Question for you')
      .setDescription(generalQuestion)
      .setTimestamp();

    for (const member of membersWithRole) {
      if (member.id !== randomImposter.id) {  // Skip the imposter
        try {
          await member.send({
            content: `${member.user}`,
            embeds: [generalEmbed],
          });
        } catch (error) {
          console.error(`Failed to DM ${member.user.username}:`, error);
        }
      }
    }

    // Send imposter question to only the random imposter
    const imposterEmbed = new EmbedBuilder()
      .setColor('#575757')
      .setTitle('Question for you')
      .setDescription(imposterQuestion)
      .setTimestamp();

    try {
      await randomImposter.send({
        content: `${randomImposter.user}`,
        embeds: [imposterEmbed],
      });
    } catch (error) {
      console.error(`Failed to DM ${randomImposter.user.username}:`, error);
    }

    await interaction.editReply({
      content: `✅ Questions sent!\n\n📋 **General Question** sent to ${membersWithRole.length - 1} players.\n🔴 **Imposter Question** sent to ${randomImposter.user.username}`,
    });
  } catch (error) {
    console.error('Error sending questions:', error);
    await interaction.editReply({
      content: '❌ Failed to send questions. Please try again.',
    });
  }
},
};