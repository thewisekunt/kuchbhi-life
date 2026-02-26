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
let currentGame = {
  active: false,
  imposterId: null,
  players: [],
  answers: new Map(),
  votes: new Map(),
  votingActive: false
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gamemaster')
    .setDescription('Open game master panel to manage Among Us style game'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🎮 Game Master Panel')
      .setDescription('Manage your Imposter game');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('open_questions_modal')
        .setLabel('Open Questions Form')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('end_game')
        .setLabel('Force End Game')
        .setStyle(ButtonStyle.Danger)
    );

    return interaction.editReply({
      embeds: [embed],
      components: [row],
    });
  },

  /* ============================
     BUTTON HANDLER
  ============================ */
  async handleButtonClick(interaction) {

    /* -------- OPEN MODAL -------- */
    if (interaction.customId === 'open_questions_modal') {
      const modal = new ModalBuilder()
        .setCustomId('game_questions_modal')
        .setTitle('Game Questions');

      const generalQuestion = new TextInputBuilder()
        .setCustomId('general_question')
        .setLabel('General Question (Crewmates)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const imposterQuestion = new TextInputBuilder()
        .setCustomId('imposter_question')
        .setLabel('Imposter Question')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(generalQuestion),
        new ActionRowBuilder().addComponents(imposterQuestion)
      );

      return interaction.showModal(modal);
    }

    /* -------- VOTING BUTTON -------- */
    if (interaction.customId.startsWith('vote_') && currentGame.votingActive) {
      const targetId = interaction.customId.split('_')[1];

      if (!currentGame.players.includes(interaction.user.id)) {
        return interaction.reply({ content: '❌ You are not in this game.', ephemeral: true });
      }

      if (currentGame.votes.has(interaction.user.id)) {
        return interaction.reply({ content: '❌ You already voted.', ephemeral: true });
      }

      currentGame.votes.set(interaction.user.id, targetId);

      await interaction.reply({ content: '🗳️ Vote registered!', ephemeral: true });

      if (currentGame.votes.size === currentGame.players.length) {
        await endVoting(interaction.channel);
      }
    }

    /* -------- FORCE END -------- */
    if (interaction.customId === 'end_game') {
      resetGame();
      return interaction.reply({ content: '🛑 Game forcefully ended.', ephemeral: false });
    }
  },

  /* ============================
     MODAL SUBMIT
  ============================ */
  async handleModalSubmit(interaction) {

    const generalQuestion = interaction.fields.getTextInputValue('general_question');
    const imposterQuestion = interaction.fields.getTextInputValue('imposter_question');

    await interaction.deferReply({ ephemeral: true });

    const imposRole = interaction.guild.roles.cache.find(r => r.name === 'impos');

    if (!imposRole || imposRole.members.size === 0) {
      return interaction.editReply({ content: '❌ No players with impos role found.' });
    }

    const players = Array.from(imposRole.members.values());
    const randomImposter = players[Math.floor(Math.random() * players.length)];

    // Initialize game
    currentGame.active = true;
    currentGame.imposterId = randomImposter.id;
    currentGame.players = players.map(p => p.id);
    currentGame.answers.clear();
    currentGame.votes.clear();
    currentGame.votingActive = false;

    // Send DMs
    for (const member of players) {
      const embed = new EmbedBuilder()
        .setColor('#575757')
        .setTitle('📩 Your Question')
        .setDescription(
          member.id === randomImposter.id
            ? imposterQuestion
            : generalQuestion
        );

      await member.send({ embeds: [embed] }).catch(() => {});
    }

    await interaction.editReply({
      content: `✅ Questions sent!\n⏳ Answer round started (90 seconds)`
    });

    await interaction.channel.send(
      `📝 **Answer Round Started!**\nYou have 90 seconds to answer in this channel.`
    );

    startAnswerCollector(interaction.channel);
  }
};

/* ============================
   ANSWER COLLECTOR
============================ */
function startAnswerCollector(channel) {
  const filter = m => currentGame.players.includes(m.author.id);

  const collector = channel.createMessageCollector({
    filter,
    time: 90000
  });

  collector.on('collect', async message => {
    if (currentGame.answers.has(message.author.id)) return;

    currentGame.answers.set(message.author.id, message.content);

    await message.react('✅').catch(() => {});
  });

  collector.on('end', async () => {
    if (!currentGame.active) return;

    await channel.send('⏰ Answer round ended!');
    await startVotingRound(channel);
  });
}

/* ============================
   VOTING ROUND
============================ */
async function startVotingRound(channel) {
  currentGame.votingActive = true;

  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('🗳️ Voting Round')
    .setDescription('Vote for who you think is the Imposter!');

  const rows = [];
  let row = new ActionRowBuilder();

  currentGame.players.forEach((playerId, index) => {

    if (row.components.length === 5) {
      rows.push(row);
      row = new ActionRowBuilder();
    }

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`vote_${playerId}`)
        .setLabel(`Vote ${playerId.slice(0,4)}`)
        .setStyle(ButtonStyle.Danger)
    );
  });

  rows.push(row);

  await channel.send({
    embeds: [embed],
    components: rows
  });
}

/* ============================
   END VOTING
============================ */
async function endVoting(channel) {
  currentGame.votingActive = false;

  const voteCount = {};

  currentGame.votes.forEach(targetId => {
    voteCount[targetId] = (voteCount[targetId] || 0) + 1;
  });

  const votedOut = Object.keys(voteCount).reduce((a, b) =>
    voteCount[a] > voteCount[b] ? a : b
  );

  const isImposter = votedOut === currentGame.imposterId;

  const embed = new EmbedBuilder()
    .setTitle('🚪 Player Eliminated')
    .setDescription(
      `<@${votedOut}> was voted out!\n\n` +
      (isImposter
        ? '🔴 They were the IMPOSTER!'
        : '🟢 They were a CREWMATE!')
    )
    .setColor(isImposter ? '#FF0000' : '#00FF00');

  await channel.send({ embeds: [embed] });

  resetGame();
}

/* ============================
   RESET GAME
============================ */
function resetGame() {
  currentGame.active = false;
  currentGame.imposterId = null;
  currentGame.players = [];
  currentGame.answers.clear();
  currentGame.votes.clear();
  currentGame.votingActive = false;
}
