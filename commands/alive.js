const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('alive')
    .setDescription('Check when a user was last active')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Select a member')
        .setRequired(true)
    ),

  async execute(interaction) {

    if (!interaction.guild) {
      return interaction.reply({
        content: '❌ Use this inside a server.',
        flags: 64
      });
    }

    const target = interaction.options.getUser('user');
    const member = interaction.guild.members.cache.get(target.id);

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    try {
      const [[row]] = await require('../db').query(
        `SELECT last_message_at, last_channel_id
         FROM last_seen
         WHERE discord_id = ?`,
        [target.id]
      );

      if (!row) {
        return interaction.editReply(`❌ No activity recorded for ${member.displayName}.`);
      }

      const lastTime = Math.floor(new Date(row.last_message_at).getTime() / 1000);

      const channel = interaction.guild.channels.cache.get(row.last_channel_id);
      const channelName = channel ? `<#${channel.id}>` : 'Unknown Channel';

      const embed = new EmbedBuilder()
        .setColor('#00FF88')
        .setTitle(`🟢 Is ${member.displayName} Alive?`)
        .setDescription(
          `${member.displayName} was last seen <t:${lastTime}:R>\n` +
          `📍 In ${channelName}`
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('Alive command error:', err);
      await interaction.editReply('❌ Failed to fetch activity.');
    }
  }
};
