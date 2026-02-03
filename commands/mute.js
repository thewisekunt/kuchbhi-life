const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');

const db = require('../db');
const ensureUser = require('../utils/ensureUser');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Timeout a member (standard mute)')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('The member to mute')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('duration')
        .setDescription('Minutes to mute (1–10080)')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for mute')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const moderator = interaction.user;
    const targetMember = interaction.options.getMember('target');
    const targetUser = interaction.options.getUser('target');
    const minutes = interaction.options.getInteger('duration');
    const reason =
      interaction.options.getString('reason') || 'No reason provided';

    if (!targetMember) {
      return interaction.editReply('❌ Target member not found.');
    }

    if (!targetMember.moderatable) {
      return interaction.editReply(
        '❌ I cannot mute this user due to role hierarchy.'
      );
    }

    if (minutes < 1 || minutes > 10080) {
      return interaction.editReply(
        '❌ Duration must be between **1 minute and 7 days**.'
      );
    }

    // Ensure users exist
    await ensureUser(moderator);
    await ensureUser(targetUser);

    try {
      // Apply Discord timeout
      await targetMember.timeout(minutes * 60 * 1000, reason);

      // Structured moderation log
      await db.execute(
        `
        INSERT INTO activity_log (user_id, action, actor_id, metadata, created_at)
        VALUES (
          (SELECT id FROM users WHERE discord_id = ? LIMIT 1),
          'MUTE',
          (SELECT id FROM users WHERE discord_id = ? LIMIT 1),
          ?,
          NOW()
        )
        `,
        [
          targetUser.id,
          moderator.id,
          JSON.stringify({
            reason,
            durationMinutes: minutes,
            guildId: interaction.guildId
          })
        ]
      );

      const embed = new EmbedBuilder()
        .setTitle('🔇 User Muted')
        .setDescription(
          `**User:** <@${targetUser.id}>\n` +
          `**Duration:** ${minutes} minutes\n` +
          `**Reason:** ${reason}`
        )
        .setColor('#95a5a6')
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('Mute Command Error:', err);
      return interaction.editReply(
        '❌ Failed to apply timeout.'
      );
    }
  }
};
