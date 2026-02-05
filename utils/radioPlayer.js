const {
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  joinVoiceChannel,
  NoSubscriberBehavior,
} = require('@discordjs/voice');
const prism = require('prism-media');
const ffmpeg = require('ffmpeg-static');
const { spawn } = require('child_process');

let connection = null;
let player = null;

function createStream(url) {
  const ffmpegProcess = spawn(ffmpeg, [
    '-i', url,
    '-analyzeduration', '0',
    '-loglevel', '0',
    '-f', 's16le',
    '-ar', '48000',
    '-ac', '2',
    'pipe:1',
  ]);

  return new prism.opus.Encoder({
    rate: 48000,
    channels: 2,
    frameSize: 960,
  }).pipe(ffmpegProcess.stdout);
}

module.exports = {
  join(channel) {
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
    const stream = createStream(url);
    const resource = createAudioResource(stream);
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