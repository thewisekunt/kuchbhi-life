const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const db = require('../db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('marry')
    .setDescription('Propose marriage to someone')
    .addUserOption(opt =>
      opt.setName('user')
        .setDescription('Who do you want to marry?')
        .setRequired(true)
    ),

  async execute(interaction) {
    const proposer = interaction.user;
    const target = interaction.options.getUser('user');

    if (proposer.id === target.id) {
      return interaction.reply({
        content: '💀 You cannot marry yourself.',
        ephemeral: true
      });
    }

    // Check if proposer or target already married
    const [existing] = await db.query(
      `
      SELECT 1 FROM marriages m
      JOIN users u1 ON u1.id = m.user1_id
      JOIN users u2 ON u2.id = m.user2_id
      WHERE u1.discord_id IN (?,?)
         OR u2.discord_id IN (?,?)
      `,
      [proposer.id, target.id, proposer.id, target.id]
    );

    if (existing.length) {
      return interaction.reply({
        content: '💔 One of you is already married.',
        ephemeral: true
      });
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

    await interaction.reply({
      content: `💍 <@${target.id}>, do you accept **${proposer.username}**'s proposal?`,
      components: [row]
    });
  }
};
