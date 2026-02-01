const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const db = require('../db'); // your mysql2/promise pool

module.exports = {
  data: new SlashCommandBuilder()
    .setName('divorce')
    .setDescription('Divorce your current partner'),

  async execute(interaction) {
    const userId = interaction.user.id;

    // 1️⃣ Find marriage
    const [rows] = await db.query(
      `
      SELECT m.id, u1.discord_id AS user1, u2.discord_id AS user2
      FROM marriages m
      JOIN users u1 ON u1.id = m.user1_id
      JOIN users u2 ON u2.id = m.user2_id
      WHERE u1.discord_id = ? OR u2.discord_id = ?
      `,
      [userId, userId]
    );

    if (!rows.length) {
      return interaction.reply({
        content: '💔 You are not married.',
        ephemeral: true
      });
    }

    const marriage = rows[0];
    const partnerId =
      marriage.user1 === userId ? marriage.user2 : marriage.user1;

    // 2️⃣ Confirmation buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`divorce_confirm_${interaction.user.id}`)
        .setLabel('Yes, Divorce 💔')
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId(`divorce_cancel_${interaction.user.id}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      content: `⚠️ Are you sure you want to divorce <@${partnerId}>?`,
      components: [row],
      ephemeral: true
    });
  }
};
