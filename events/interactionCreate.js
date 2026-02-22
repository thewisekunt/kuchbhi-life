const imposterCommand = require('../commands/imposter');
const gamemasterCommand = require('../commands/gamemaster');

module.exports = (client) => {
  client.on('interactionCreate', async (interaction) => {
    // Handle button interactions
    if (interaction.isButton()) {
      if (interaction.customId === 'join_imposter_game' || interaction.customId === 'leave_imposter_game') {
        await imposterCommand.handleButtonClick(interaction);
      } else if (interaction.customId === 'open_questions_modal' || interaction.customId === 'start_game' || interaction.customId === 'end_game') {
        await gamemasterCommand.handleButtonClick(interaction);
      }
    }

    // Handle modal submissions
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'game_questions_modal') {
        await gamemasterCommand.handleModalSubmit(interaction);
      }
    }
  });
};

