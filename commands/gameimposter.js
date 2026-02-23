const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const db = require('../db');

const activeGames = new Map(); // guildId -> state

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gameimposter')
    .setDescription('Imposter Game Control Panel'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#ff0040')
      .setTitle('🎮 Imposter Game Control');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('gm_questions')
        .setLabel('Set Questions')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('gm_start')
        .setLabel('Start Game')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId('gm_end')
        .setLabel('Force End')
        .setStyle(ButtonStyle.Danger)
    );

    return interaction.editReply({ embeds: [embed], components: [row] });
  },

  async handleButtonClick(interaction) {
    const guildId = interaction.guildId;

    if (interaction.customId === 'gm_questions') {
      const modal = new ModalBuilder()
        .setCustomId('gm_modal_questions')
        .setTitle('Game Questions');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('general')
            .setLabel('General Question')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('imposter')
            .setLabel('Imposter Question')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

      return interaction.showModal(modal);
    }

    if (interaction.customId === 'gm_start') {
      if (activeGames.has(guildId))
        return interaction.reply({ content: '⚠ Game already running.', ephemeral: true });

      const imposRole = interaction.guild.roles.cache.find(r => r.name === 'impos');
      if (!imposRole || imposRole.members.size < 3)
        return interaction.reply({ content: '❌ Need at least 3 players.', ephemeral: true });

      const players = Array.from(imposRole.members.values())
        .filter(m => !m.user.bot);

      const thread = await interaction.channel.threads.create({
        name: `🎮 Imposter Round`,
        autoArchiveDuration: 60
      });

      const game = {
        thread,
        players: new Map(),
        phase: 'setup',
        generalQuestion: null,
        imposterQuestion: null,
        imposterId: null
      };

      players.forEach(m => {
        game.players.set(m.id, {
          score: 0,
          answered: false,
          vote: null,
          lastActive: Date.now()
        });
      });

      activeGames.set(guildId, game);

      await thread.send(`🎮 Game started! <@&${imposRole.id}>`);

      return interaction.reply({ content: '✅ Thread created.', ephemeral: true });
    }

    if (interaction.customId === 'gm_end') {
      activeGames.delete(guildId);
      return interaction.reply({ content: '🛑 Game force ended.', ephemeral: true });
    }
  },

  async handleModalSubmit(interaction) {
    const guildId = interaction.guildId;
    const game = activeGames.get(guildId);
    if (!game)
      return interaction.reply({ content: '❌ No active game.', ephemeral: true });

    const general = interaction.fields.getTextInputValue('general');
    const imposter = interaction.fields.getTextInputValue('imposter');

    game.generalQuestion = general;
    game.imposterQuestion = imposter;

    const playerIds = Array.from(game.players.keys());
    const randomImposter = playerIds[Math.floor(Math.random() * playerIds.length)];
    game.imposterId = randomImposter;

    for (const id of playerIds) {
      const member = await interaction.guild.members.fetch(id);
      const q = id === randomImposter ? imposter : general;
      await member.send(`🎮 Your Question:\n**${q}**`).catch(() => {});
    }

    await interaction.reply({ content: '📩 Questions sent.', ephemeral: true });

    startAnswerPhase(game);
  }
};

/* =========================
   GAME ENGINE
========================= */

async function startAnswerPhase(game) {
  game.phase = 'answering';
  const thread = game.thread;

  await thread.send('🕒 1:30 minutes to answer.');

  const collector = thread.createMessageCollector({ time: 90000 });

  collector.on('collect', msg => {
    if (!game.players.has(msg.author.id)) return;

    const p = game.players.get(msg.author.id);
    if (!p.answered) {
      p.answered = true;
      p.lastActive = Date.now();
      msg.react('✅');
    }
  });

  collector.on('end', () => {
    startVotingPhase(game);
  });
}

async function startVotingPhase(game) {
  game.phase = 'voting';
  const thread = game.thread;

  const ids = Array.from(game.players.keys());

  const voteMsg = await thread.send(
    '🗳 Vote Imposter:\n' +
    ids.map((id, i) => `${i+1}. <@${id}>`).join('\n')
  );

  const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣'];

  for (let i = 0; i < ids.length; i++)
    await voteMsg.react(emojis[i]);

  const collector = voteMsg.createReactionCollector({
    time: 45000
  });

  collector.on('collect', (reaction, user) => {
    if (!game.players.has(user.id)) return;
    const index = emojis.indexOf(reaction.emoji.name);
    if (index >= 0)
      game.players.get(user.id).vote = ids[index];
  });

  collector.on('end', () => {
    calculateResults(game);
  });
}

async function calculateResults(game) {
  const thread = game.thread;
  const votes = {};

  for (const [id, p] of game.players) {
    if (p.vote)
      votes[p.vote] = (votes[p.vote] || 0) + 1;
  }

  const top = Object.entries(votes)
    .sort((a,b)=>b[1]-a[1])[0];

  if (top && top[0] === game.imposterId) {
    await thread.send('🎉 Imposter caught!');
    for (const [id,p] of game.players)
      if (id !== game.imposterId) p.score += 2;
  } else {
    await thread.send('😈 Imposter survived!');
    game.players.get(game.imposterId).score += 3;
  }

  await updateLeaderboard(game);
  await sendLeaderboard(game);
  removeInactive(game);

  setTimeout(()=> startAnswerPhase(game), 7000);
}

async function updateLeaderboard(game) {
  for (const [id,p] of game.players) {
    await db.execute(`
      INSERT INTO imposter_leaderboard
      (guild_id,user_id,score,rounds_played,last_played)
      VALUES (?,?,?,?,NOW())
      ON DUPLICATE KEY UPDATE
        score = score + ?,
        rounds_played = rounds_played + 1,
        last_played = NOW()
    `,[game.thread.guild.id,id,p.score,1,p.score]);
  }
}

async function sendLeaderboard(game) {
  const [rows] = await db.query(`
    SELECT user_id, score
    FROM imposter_leaderboard
    WHERE guild_id=?
    ORDER BY score DESC
    LIMIT 10
  `,[game.thread.guild.id]);

  const desc = rows.map((r,i)=>
    `#${i+1} <@${r.user_id}> — ${r.score} pts`
  ).join('\n');

  await game.thread.send({
    embeds:[{
      title:'🏆 Leaderboard',
      description: desc || 'No data',
      color:0xFFD700
    }]
  });
}

function removeInactive(game){
  const now = Date.now();
  for(const [id,p] of game.players){
    if(now - p.lastActive > 180000){
      game.thread.send(`<@${id}> removed (AFK).`);
      game.players.delete(id);
    }
  }
}