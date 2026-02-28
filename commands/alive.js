const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('alive')
    .setDescription('Check when a user was last active (text & voice)')
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
    const member = await interaction.guild.members.fetch(target.id);

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    try {
      const [[row]] = await db.query(
        `
        SELECT 
          last_message_at,
          last_channel_id,
          last_voice_at,
          last_voice_channel_id
        FROM last_seen
        WHERE discord_id = ?
        `,
        [target.id]
      );

      if (!row) {
        return interaction.editReply(
          `❌ No activity recorded for ${member.displayName}.`
        );
      }

      /* ==========================
         TEXT ACTIVITY
      ========================== */
      let textInfo = 'No text activity recorded.';
      if (row.last_message_at) {
        const textTime = Math.floor(
          new Date(row.last_message_at).getTime() / 1000
        );

        const textChannel =
          interaction.guild.channels.cache.get(row.last_channel_id);

        const textChannelName = textChannel
          ? `<#${textChannel.id}>`
          : 'Unknown Channel';

        textInfo =
          `📝 Last message <t:${textTime}:R>\n` +
          `📍 ${textChannelName}`;
      }

      /* ==========================
         VOICE ACTIVITY
      ========================== */
      let voiceInfo = 'No voice activity recorded.';

      // If currently in VC
      if (member.voice?.channel) {
        voiceInfo =
          `🔊 Currently in voice: <#${member.voice.channel.id}>`;
      } else if (row.last_voice_at) {

        const voiceTime = Math.floor(
          new Date(row.last_voice_at).getTime() / 1000
        );

        const voiceChannel =
          interaction.guild.channels.cache.get(row.last_voice_channel_id);

        const voiceChannelName = voiceChannel
          ? `<#${voiceChannel.id}>`
          : 'Unknown Channel';

        voiceInfo =
          `🎙 Last voice activity <t:${voiceTime}:R>\n` +
          `📍 ${voiceChannelName}`;
      }

      /* ==========================
         STATUS COLOR LOGIC
      ========================== */

      let color = '#2ECC71'; // green default

      const now = Date.now();
      const lastTextMs = row.last_message_at
        ? new Date(row.last_message_at).getTime()
        : 0;

      if (lastTextMs) {
        const diffMinutes = (now - lastTextMs) / 60000;

        if (diffMinutes > 60) color = '#F1C40F'; // yellow
        if (diffMinutes > 1440) color = '#E74C3C'; // red (1 day)
      }

      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`Is ${member.displayName} Alive?`)
        .setDescription(
          `${textInfo}\n\n${voiceInfo}`
        )
        .setThumbnail(member.displayAvatarURL())
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (err) {
      console.error('Alive command error:', err);
      await interaction.editReply('❌ Failed to fetch activity.');
    }
  }
};
