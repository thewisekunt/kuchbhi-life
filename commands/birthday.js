const { SlashCommandBuilder } = require('discord.js');
const db = require('../db');
const ensureUser = require('../utils/ensureUser');

// Days per month (non-leap; birthdays don’t care about year)
const DAYS_IN_MONTH = {
  1: 31,
  2: 29,
  3: 31,
  4: 30,
  5: 31,
  6: 30,
  7: 31,
  8: 31,
  9: 30,
  10: 31,
  11: 30,
  12: 31
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('Register or remove your birthday')
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Set your birthday')
        .addIntegerOption(opt =>
          opt
            .setName('day')
            .setDescription('Day (1–31)')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt
            .setName('month')
            .setDescription('Month (1–12)')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Remove your birthday')
    ),

  async execute(interaction) {
    const user = interaction.user;
    const sub = interaction.options.getSubcommand();

    // Ensure user exists
    await ensureUser(user);

    try {
      if (sub === 'remove') {
        await db.execute(
          `
          UPDATE users
          SET birth_day = NULL,
              birth_month = NULL
          WHERE discord_id = ?
          `,
          [user.id]
        );

        return interaction.editReply('🧹 Your birthday has been removed.');
      }

      const day = interaction.options.getInteger('day');
      const month = interaction.options.getInteger('month');

      if (
        !DAYS_IN_MONTH[month] ||
        day < 1 ||
        day > DAYS_IN_MONTH[month]
      ) {
        return interaction.editReply(
          '❌ Invalid date. Please check the day and month.'
        );
      }

      await db.execute(
        `
        UPDATE users
        SET birth_day = ?,
            birth_month = ?
        WHERE discord_id = ?
        `,
        [day, month, user.id]
      );

      return interaction.editReply(
        `🎉 Birthday saved for **${day}/${month}**!`
      );

    } catch (err) {
      console.error('Birthday Command Error:', err);
      return interaction.editReply(
        '❌ Database error while saving birthday.'
      );
    }
  }
};
