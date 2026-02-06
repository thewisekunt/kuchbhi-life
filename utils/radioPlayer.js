const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  NoSubscriberBehavior,
  AudioPlayerStatus,
  StreamType,
} = require('@discordjs/voice');

const ffmpeg = require('ffmpeg-static');
const { spawn } = require('child_process');

let connection;
let player;

function createFFmpegStream(url) {
  return spawn(ffmpeg, [
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
    '-i', url,
    '-analyzeduration', '0',
    '-loglevel', '0',
    '-vn',
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1',
  ], { stdio: ['ignore', 'pipe', 'ignore'] }).stdout;
}

module.exports = {
  join(channel) {
    if (connection) return;

    connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
    });

    player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play,
      },
    });

    connection.subscribe(player);
  },

  play(url) {
    if (!player) throw new Error('Radio not joined');

    const stream = createFFmpegStream(url);

    const resource = createAudioResource(stream, {
      inputType: StreamType.Raw, // 🔑 THIS IS THE FIX
    });

    player.play(resource);
  },

  stop() {
    if (player) player.stop();
  },

  leave() {
    if (connection) {
      connection.destroy();
      connection = null;
      player = null;
    }
  },
};
