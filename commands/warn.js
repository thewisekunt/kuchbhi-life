const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');

const db = require('../db');
const ensureUser = require('../utils/ensureUser');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue a formal warning to a member')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('The member to warn')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for the warning')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const moderator = interaction.user;
    const targetUser = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason');

    if (targetUser.bot) {
      return interaction.editReply('🤖 Bots cannot be warned.');
    }

    // Ensure both users exist
    await ensureUser(moderator);
    await ensureUser(targetUser);

    try {
      // Store structured moderation log
      await db.execute(
        `
        INSERT INTO activity_log (user_id, action, actor_id, metadata, created_at)
        VALUES (
          (SELECT id FROM users WHERE discord_id = ? LIMIT 1),
          'WARN',
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
            channelId: interaction.channelId
          })
        ]
      );

      const embed = new EmbedBuilder()
        .setTitle('⚠️ User Warned')
        .setDescription(
          `**User:** <@${targetUser.id}>\n**Reason:** ${reason}`
        )
        .setColor('#f1c40f')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Attempt DM (silent failure allowed)
      try {
        await targetUser.send(
          `⚠️ You have received a warning in **Kuch Bhi**.\n\n**Reason:** ${reason}`
        );
      } catch {
        // DM closed – ignore silently
      }

    } catch (err) {
      console.error('Warn Command Error:', err);
      return interaction.editReply('❌ Failed to issue warning.');
    }
  }
};
