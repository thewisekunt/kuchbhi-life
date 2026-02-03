const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');

const db = require('../db');
const ensureUser = require('../utils/ensureUser');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Bulk delete messages (Dyno style)')
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('Number of messages to delete (1–100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const moderator = interaction.user;
    const amount = interaction.options.getInteger('amount');

    // Ensure moderator exists in DB
    await ensureUser(moderator);

    try {
      const deleted = await interaction.channel.bulkDelete(amount, true);

      // Optional moderation log (structured)
      try {
        await db.execute(
          `
          INSERT INTO activity_log (user_id, action, actor_id, metadata, created_at)
          VALUES (
            NULL,
            'PURGE',
            (SELECT id FROM users WHERE discord_id = ? LIMIT 1),
            ?,
            NOW()
          )
          `,
          [
            moderator.id,
            JSON.stringify({
              amountRequested: amount,
              amountDeleted: deleted.size,
              channelId: interaction.channelId,
              guildId: interaction.guildId
            })
          ]
        );
      } catch {
        // Logging failure should never block moderation
      }

      const embed = new EmbedBuilder()
        .setTitle('🧹 Messages Purged')
        .setDescription(
          `**${deleted.size}** messages were successfully deleted.`
        )
        .setColor('#2ecc71')
        .setTimestamp();

      return interaction.editReply({
        embeds: [embed],
        ephemeral: true
      });

    } catch (err) {
      console.error('Purge Command Error:', err);
      return interaction.editReply(
        '❌ Failed to delete messages. Messages older than 14 days cannot be deleted.'
      );
    }
  }
};
