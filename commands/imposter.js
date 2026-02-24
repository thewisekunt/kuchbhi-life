const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('imposter')
    .setDescription('Join or leave the game lobby'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('🎮 Imposter Game Lobby')
      .setDescription('Join now to be included in the next round!');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('join_imposter_game').setLabel('Join').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('leave_imposter_game').setLabel('Leave').setStyle(ButtonStyle.Danger)
    );

    return interaction.editReply({ embeds: [embed], components: [row] });
  }
};
