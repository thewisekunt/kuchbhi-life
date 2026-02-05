const { SlashCommandBuilder } = require('discord.js');
const radio = require('../utils/radioPlayer');
const stations = require('../radioStations');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('radio')
    .setDescription('Kuch Bhi Radio 📻')
    .addSubcommand(s =>
      s.setName('join').setDescription('Join your voice channel')
    )
    .addSubcommand(s =>
      s.setName('play')
        .setDescription('Play a radio station')
        .addStringOption(opt =>
          opt.setName('station')
            .setDescription('Choose station')
            .setRequired(true)
            .addChoices(
              { name: 'Hindi Radio', value: 'hindi' },
              { name: 'English Radio', value: 'english' },
              { name: 'Chill / Lo-Fi', value: 'chill' }
            )
        )
    )
    .addSubcommand(s =>
      s.setName('stop').setDescription('Stop the radio')
    )
    .addSubcommand(s =>
      s.setName('leave').setDescription('Leave voice channel')
    ),

  async execute(interaction) {
    const member = interaction.member;
    const vc = member.voice.channel;

    if (!vc && interaction.options.getSubcommand() !== 'leave') {
      return interaction.reply({
        content: '❌ Join a voice channel first.',
        ephemeral: true,
      });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'join') {
      radio.join(vc);
      return interaction.reply('📻 Kuch Bhi Radio joined the VC!');
    }

    if (sub === 'play') {
      const key = interaction.options.getString('station');
      const station = stations[key];

      radio.join(vc);
      radio.play(station.url);

      return interaction.reply(
        `▶️ **Now Playing:** ${station.name}`
      );
    }

    if (sub === 'stop') {
      radio.stop();
      return interaction.reply('⏸ Radio stopped.');
    }

    if (sub === 'leave') {
      radio.leave();
      return interaction.reply('👋 Radio left the VC.');
    }
  },
};