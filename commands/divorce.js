const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const db = require('../db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('divorce')
    .setDescription('Divorce your current partner'),

  async execute(interaction) {
    const userId = interaction.user.id;

    try {
        const [rows] = await db.query(
          `
          SELECT m.id, u1.discord_id AS user1, u2.discord_id AS user2
          FROM marriages m
          JOIN users u1 ON u1.id = m.user1_id
          JOIN users u2 ON u2.id = m.user2_id
          WHERE u1.discord_id = ? OR u2.discord_id = ?
          LIMIT 1
          `,
          [userId, userId]
        );

        if (!rows.length) {
          return interaction.editReply({
            content: '💔 You are not married.'
          });
        }

        const marriage = rows[0];
        const partnerId = marriage.user1 === userId ? marriage.user2 : marriage.user1;

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`divorce_confirm_${userId}`)
            .setLabel('Yes, Divorce 💔')
            .setStyle(ButtonStyle.Danger),

          new ButtonBuilder()
            .setCustomId(`divorce_cancel_${userId}`)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary)
        );

        await interaction.editReply({
          content: `⚠️ Are you sure you want to divorce <@${partnerId}>?`,
          components: [row]
        });
    } catch (err) {
        console.error('Divorce Command Error:', err.message);
        await interaction.editReply('❌ Database error occurred.');
    }
  }
};