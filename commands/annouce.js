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
    /**
     * ⚠️ IMPORTANT
     * This command MUST NOT be deferred.
     * index.js already excludes `announce` from auto-defer.
     */

    const modal = new ModalBuilder()
      .setCustomId('announcement_modal')
      .setTitle('Create New Announcement');

    const titleInput = new TextInputBuilder()
      .setCustomId('ann_title')
      .setLabel('Title')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter announcement title')
      .setRequired(true);

    const badgeInput = new TextInputBuilder()
      .setCustomId('ann_badge')
      .setLabel('Badge (e.g. INFO, UPDATE)')
      .setStyle(TextInputStyle.Short)
      .setValue('INFO')
      .setRequired(true);

    const bodyInput = new TextInputBuilder()
      .setCustomId('ann_body')
      .setLabel('Content')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Write announcement content here…')
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(badgeInput),
      new ActionRowBuilder().addComponents(bodyInput)
    );

    try {
      await interaction.showModal(modal);
    } catch (err) {
      console.error('Announce Modal Error:', err);

      // Fallback in rare edge cases
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ Failed to open announcement modal.',
          ephemeral: true
        });
      }
    }
  }
};
