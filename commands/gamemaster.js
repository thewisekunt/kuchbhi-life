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

/* ============================
   GAME STATE
============================ */
let game = {
  active: false,
  imposterId: null,
  players: [],
  answers: new Map(),
  votes: new Map(),
  votingActive: false,
  roleId: null,
  round: 1,
  generalQuestion: null,
  imposterQuestion: null
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gamemaster')
    .setDescription('Open survival imposter game'),

  /* ============================
     EXECUTE
  ============================ */
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🎮 Survival Imposter')
      .setDescription('Start a survival elimination game');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('open_questions_modal')
        .setLabel('Start Game')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('force_end')
        .setLabel('Force End')
        .setStyle(ButtonStyle.Danger)
    );

    return interaction.reply({ embeds: [embed], components: [row] });
  },

  /* ============================
     BUTTON HANDLER
  ============================ */
  async handleButtonClick(interaction) {

    /* OPEN MODAL */
    if (interaction.customId === 'open_questions_modal') {
      const modal = new ModalBuilder()
        .setCustomId('game_questions_modal')
        .setTitle('Game Questions');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('general_question')
            .setLabel('Crewmate Question')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('imposter_question')
            .setLabel('Imposter Question')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

      return interaction.showModal(modal);
    }

    /* FORCE END */
    if (interaction.customId === 'force_end') {
      resetGame();
      return interaction.reply({ content: '🛑 Game ended.', ephemeral: true });
    }

    /* VOTING */
    if (interaction.customId.startsWith('vote_') && game.votingActive) {
      await interaction.deferReply({ ephemeral: true });

      const targetId = interaction.customId.split('_')[1];

      if (!game.players.find(p => p.id === interaction.user.id)) {
        return interaction.editReply('❌ You are not in the game.');
      }

      if (game.votes.has(interaction.user.id)) {
        return interaction.editReply('❌ You already voted.');
      }

      game.votes.set(interaction.user.id, targetId);
      await interaction.editReply('🗳️ Vote registered.');

      if (game.votes.size === game.players.length) {
        endVoting(interaction.channel);
      }
    }
  },

  /* ============================
     MODAL SUBMIT
  ============================ */
  async handleModalSubmit(interaction) {

    if (interaction.customId !== 'game_questions_modal') return;

    await interaction.deferReply({ ephemeral: true });

    const generalQuestion = interaction.fields.getTextInputValue('general_question');
    const imposterQuestion = interaction.fields.getTextInputValue('imposter_question');

    const imposRole = interaction.guild.roles.cache.find(r => r.name === 'impos');

    if (!imposRole || imposRole.members.size < 3) {
      return interaction.editReply('❌ Need at least 3 players.');
    }

    const members = Array.from(imposRole.members.values());
    const imposter = members[Math.floor(Math.random() * members.length)];

    game.active = true;
    game.imposterId = imposter.id;
    game.players = members.map(m => ({
      id: m.id,
      username: m.user.username
    }));
    game.roleId = imposRole.id;
    game.round = 1;
    game.generalQuestion = generalQuestion;
    game.imposterQuestion = imposterQuestion;

    await interaction.editReply('✅ Game started!');

    startRound(interaction.channel);
  }
};

/* ============================
   START ROUND
============================ */
async function startRound(channel) {
  game.answers.clear();
  game.votes.clear();
  game.votingActive = false;

  await channel.send({
    content: `<@&${game.roleId}> 🔥 **Round ${game.round} Started!**\nAnswer time: 60 seconds`,
    allowedMentions: { parse: ['roles'] }
  });

  for (const player of game.players) {
    const member = await channel.guild.members.fetch(player.id);

    const embed = new EmbedBuilder()
      .setTitle('📩 Your Question')
      .setColor('#575757')
      .setDescription(
        player.id === game.imposterId
          ? game.imposterQuestion
          : game.generalQuestion
      );

    await member.send({ embeds: [embed] }).catch(() => {});
  }

  startAnswerCollector(channel);
}

/* ============================
   ANSWER ROUND (60 sec OR early)
============================ */
function startAnswerCollector(channel) {
  const collector = channel.createMessageCollector({
    filter: m => game.players.some(p => p.id === m.author.id),
    time: 60000
  });

  collector.on('collect', async msg => {
    if (game.answers.has(msg.author.id)) return;

    game.answers.set(msg.author.id, msg.content);
    await msg.react('✅').catch(() => {});

    if (game.answers.size === game.players.length) {
      collector.stop();
    }
  });

  collector.on('end', async () => {
    if (!game.active) return;

    await channel.send('⏰ Answer round ended!');
    startVotingRound(channel);
  });
}

/* ============================
   VOTING ROUND (30 sec OR early)
============================ */
async function startVotingRound(channel) {
  game.votingActive = true;

  const embed = new EmbedBuilder()
    .setTitle(`🗳️ Voting Round ${game.round}`)
    .setDescription('30 seconds to vote!')
    .setColor('#FF0000');

  const rows = [];
  let row = new ActionRowBuilder();

  for (const player of game.players) {
    if (row.components.length === 5) {
      rows.push(row);
      row = new ActionRowBuilder();
    }

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`vote_${player.id}`)
        .setLabel(player.username)
        .setStyle(ButtonStyle.Danger)
    );
  }

  rows.push(row);

  await channel.send({
    content: `<@&${game.roleId}> 🗳️ Voting started!`,
    embeds: [embed],
    components: rows,
    allowedMentions: { parse: ['roles'] }
  });

  setTimeout(() => {
    if (game.votingActive) endVoting(channel);
  }, 30000);
}

/* ============================
   END VOTING
============================ */
async function endVoting(channel) {
  game.votingActive = false;

  const tally = {};
  game.votes.forEach(id => {
    tally[id] = (tally[id] || 0) + 1;
  });

  if (Object.keys(tally).length === 0) {
    await channel.send('⚠️ No votes cast.');
    nextRound(channel);
    return;
  }

  const votedOut = Object.keys(tally).reduce((a, b) =>
    tally[a] > tally[b] ? a : b
  );

  const isImposter = votedOut === game.imposterId;

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle('🚪 Eliminated')
        .setDescription(
          `<@${votedOut}> was eliminated!\n\n` +
          (isImposter
            ? '🔴 IMPOSTER CAUGHT! Crewmates win!'
            : '🟢 They were innocent...')
        )
        .setColor(isImposter ? '#FF0000' : '#00FF00')
    ]
  });

  if (isImposter) {
    resetGame();
    return;
  }

  game.players = game.players.filter(p => p.id !== votedOut);

  if (game.players.length <= 2) {
    await channel.send('🔴 Imposter survives. Imposter wins!');
    resetGame();
    return;
  }

  game.round++;
  nextRound(channel);
}

/* ============================
   NEXT ROUND
============================ */
function nextRound(channel) {
  setTimeout(() => {
    startRound(channel);
  }, 4000);
}

/* ============================
   RESET
============================ */
function resetGame() {
  game = {
    active: false,
    imposterId: null,
    players: [],
    answers: new Map(),
    votes: new Map(),
    votingActive: false,
    roleId: null,
    round: 1,
    generalQuestion: null,
    imposterQuestion: null
  };
}
