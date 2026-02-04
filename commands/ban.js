const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../db');
const ensureUser = require('../utils/ensureUser');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .addUserOption(option =>
      option.setName('target')
        .setDescription('The member to ban')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for ban')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

  async execute(interaction) {
    const targetMember = interaction.options.getMember('target');
    const reason =
      interaction.options.getString('reason') || 'No reason provided';
    const moderator = interaction.user;

    if (!targetMember) {
      return interaction.editReply('❌ User not found in this server.');
    }

    if (!targetMember.bannable) {
      return interaction.editReply('❌ I cannot ban this user (role hierarchy).');
    }

    try {
      await ensureUser(targetMember.user);
      await ensureUser(moderator);

      await targetMember.ban({
        reason: `Banned by ${moderator.username}: ${reason}`
      });

      await db.execute(
        `
        INSERT INTO activity_log (user_id, discord_id, type, metadata, created_at)
        VALUES (
          (SELECT id FROM users WHERE discord_id = ? LIMIT 1),
          ?,
          'BAN',
          ?,
          NOW()
        )
        `,
        [
          targetMember.id,
          targetMember.id,
          `Banned by ${moderator.username}: ${reason}`
        ]
      );

      await interaction.editReply(
        `✈️ **${targetMember.user.username}** banned.\nReason: ${reason}`
      );

    } catch (err) {
      console.error('Ban Command Error:', err);
      await interaction.editReply('❌ Failed to ban user.');
    }
  }
};
