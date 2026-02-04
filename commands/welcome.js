const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Configure welcome messages')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
      sub
        .setName('set')
        .setDescription('Set welcome message')
        .addChannelOption(opt =>
          opt.setName('channel')
            .setDescription('Welcome channel')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('message')
            .setDescription('Welcome message (use {user}, {server}, {count})')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('disable').setDescription('Disable welcome messages')
    )
    .addSubcommand(sub =>
      sub.setName('test').setDescription('Test the welcome message')
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel');
      const message = interaction.options.getString('message');

      await db.execute(
        `
        INSERT INTO welcome_settings (guild_id, channel_id, message, enabled)
        VALUES (?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE
          channel_id = VALUES(channel_id),
          message = VALUES(message),
          enabled = 1
        `,
        [guildId, channel.id, message]
      );

      return interaction.editReply('✅ Welcome message configured.');
    }

    if (sub === 'disable') {
      await db.execute(
        `UPDATE welcome_settings SET enabled = 0 WHERE guild_id = ?`,
        [guildId]
      );

      return interaction.editReply('❌ Welcome messages disabled.');
    }

    if (sub === 'test') {
      const [[config]] = await db.execute(
        `SELECT * FROM welcome_settings WHERE guild_id = ? AND enabled = 1`,
        [guildId]
      );

      if (!config) {
        return interaction.editReply('❌ Welcome system not configured.');
      }

      const preview = formatMessage(config.message, interaction.member);

      const channel = interaction.guild.channels.cache.get(config.channel_id);
      if (!channel) return interaction.editReply('❌ Channel not found.');

      await channel.send({ content: preview });
      return interaction.editReply('✅ Test welcome sent.');
    }
  }
};

function formatMessage(template, member) {
  return template
    .replace('{user}', `<@${member.id}>`)
    .replace('{username}', member.user.username)
    .replace('{server}', member.guild.name)
    .replace('{count}', member.guild.memberCount);
}
