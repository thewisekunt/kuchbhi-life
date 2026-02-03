const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const db = require('../db');
const ensureUser = require('../utils/ensureUser');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('marry')
    .setDescription('Propose marriage to someone')
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('Who do you want to marry?')
        .setRequired(true)
    ),

  async execute(interaction) {
    const proposer = interaction.user;
    const target = interaction.options.getUser('user');

    if (proposer.id === target.id) {
      return interaction.editReply('💀 You cannot marry yourself.');
    }

    if (target.bot) {
      return interaction.editReply('🤖 You cannot marry a bot.');
    }

    // Ensure both users exist
    await ensureUser(proposer);
    await ensureUser(target);

    try {
      // Check if either person is already married
      const [existing] = await db.query(
        `
        SELECT 1
        FROM marriages m
        JOIN users u1 ON u1.id = m.user1_id
        JOIN users u2 ON u2.id = m.user2_id
        WHERE u1.discord_id IN (?, ?)
           OR u2.discord_id IN (?, ?)
        LIMIT 1
        `,
        [proposer.id, target.id, proposer.id, target.id]
      );

      if (existing.length > 0) {
        return interaction.editReply('💔 One of you is already married.');
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`marry_accept_${proposer.id}_${target.id}`)
          .setLabel('💍 Say Yes')
          .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
          .setCustomId(`marry_reject_${proposer.id}_${target.id}`)
          .setLabel('❌ Reject')
          .setStyle(ButtonStyle.Danger)
      );

      return interaction.editReply({
        content: `💍 <@${target.id}>, do you accept **${proposer.username}**'s proposal?`,
        components: [row]
      });

    } catch (err) {
      console.error('Marry Command Error:', err);
      return interaction.editReply(
        '❌ Database error while checking marriage status.'
      );
    }
  }
};
