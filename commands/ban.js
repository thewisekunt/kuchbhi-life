const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');

const db = require('../db');
const ensureUser = require('../utils/ensureUser');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('The member to ban')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Reason for ban')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const moderator = interaction.user;
    const targetMember = interaction.options.getMember('target');
    const targetUser = interaction.options.getUser('target');
    const reason =
      interaction.options.getString('reason') || 'No reason provided';

    if (!targetMember) {
      return interaction.editReply('❌ User not found in this server.');
    }

    if (!targetMember.bannable) {
      return interaction.editReply(
        '❌ I cannot ban this user due to role hierarchy.'
      );
    }

    // Ensure users exist in DB
    await ensureUser(moderator);
    await ensureUser(targetUser);

    try {
      // Attempt ban
      await targetMember.ban({
        reason: `Banned by ${moderator.username}: ${reason}`
      });

      // Structured moderation log
      await db.execute(
        `
        INSERT INTO activity_log (user_id, action, actor_id, metadata, created_at)
        VALUES (
          (SELECT id FROM users WHERE discord_id = ? LIMIT 1),
          'BAN',
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
            guildId: interaction.guildId
          })
        ]
      );

      const embed = new EmbedBuilder()
        .setTitle('🚫 User Banned')
        .setDescription(
          `**User:** <@${targetUser.id}>\n**Reason:** ${reason}`
        )
        .setColor('#e74c3c')
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('Ban Command Error:', err);
      return interaction.editReply('❌ Failed to ban user.');
    }
  }
};
