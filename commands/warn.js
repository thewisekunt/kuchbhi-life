const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../db');
const ensureUser = require('../utils/ensureUser');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue a formal warning to a member')
    .addUserOption(option =>
      option.setName('target')
        .setDescription('The member to warn')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the warning')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

  async execute(interaction) {
    const targetUser = interaction.options.getUser('target');
    const reason = interaction.options.getString('reason');
    const moderator = interaction.user;

    if (targetUser.bot) {
      return interaction.editReply('🤖 Bots cannot be warned.');
    }

    try {
      // Ensure both users exist
      await ensureUser(targetUser);
      await ensureUser(moderator);

      await db.execute(
        `
        INSERT INTO activity_log (user_id, discord_id, type, metadata, created_at)
        VALUES (
          (SELECT id FROM users WHERE discord_id = ? LIMIT 1),
          ?,
          'WARN',
          ?,
          NOW()
        )
        `,
        [
          targetUser.id,
          targetUser.id,
          `Warned by ${moderator.username}: ${reason}`
        ]
      );

      const embed = new EmbedBuilder()
        .setTitle('⚠️ User Warned')
        .setDescription(
          `**User:** <@${targetUser.id}>\n` +
          `**Reason:** ${reason}`
        )
        .setColor('#f1c40f')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      // Try DM (silent fail)
      try {
        await targetUser.send(
          `⚠️ You were warned in **Kuch Bhi**.\nReason: ${reason}`
        );
      } catch {}

    } catch (err) {
      console.error('Warn Command Error:', err);
      await interaction.editReply('❌ Database error while issuing warning.');
    }
  }
};
