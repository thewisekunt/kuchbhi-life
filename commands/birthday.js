const { SlashCommandBuilder } = require('discord.js');
const db = require('../db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('birthday')
    .setDescription('Register or remove your birthday')
    .addSubcommand(sub =>
      sub.setName('set')
        .setDescription('Set your birthday')
        .addIntegerOption(opt =>
          opt.setName('day')
            .setDescription('Day (1–31)')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('month')
            .setDescription('Month (1–12)')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('remove')
        .setDescription('Remove your birthday')
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand();
    const user = interaction.user;

    // Ensure user exists
    await db.execute(
      `INSERT IGNORE INTO users (discord_id, username)
       VALUES (?, ?)`,
      [user.id, user.username]
    );

    if (sub === 'remove') {
      await db.execute(`
        UPDATE users
        SET birth_day = NULL, birth_month = NULL
        WHERE discord_id = ?
      `, [user.id]);

      return interaction.editReply('🧹 Your birthday has been removed.');
    }

    const day = interaction.options.getInteger('day');
    const month = interaction.options.getInteger('month');

    if (day < 1 || day > 31 || month < 1 || month > 12) {
      return interaction.editReply('❌ Invalid date.');
    }

    await db.execute(`
      UPDATE users
      SET birth_day = ?, birth_month = ?
      WHERE discord_id = ?
    `, [day, month, user.id]);

    await interaction.editReply(
      `🎉 Birthday saved!\nYou’ll be celebrated on **${day}/${month}**`
    );
  }
};
