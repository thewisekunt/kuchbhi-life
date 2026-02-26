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
  players: [], // { id, username }
  answers: new Map(),
  votes: new Map(),
  votingActive: false,
  roleId: null
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gamemaster')
    .setDescription('Open game master panel'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🎮 Game Master Panel')
      .setDescription('Manage the Imposter game');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('open_questions_modal')
        .setLabel('Open Questions')
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

    /* -------- VOTING -------- */
    if (interaction.customId.startsWith('vote_') && currentGame.votingActive) {
      await interaction.deferReply({ ephemeral: true });

      const targetId = interaction.customId.split('_')[1];

      if (!currentGame.players.some(p => p.id === interaction.user.id)) {
        return interaction.editReply('❌ You are not in this game.');
      }

      if (currentGame.votes.has(interaction.user.id)) {
        return interaction.editReply('❌ You already voted.');
      }

      currentGame.votes.set(interaction.user.id, targetId);

      await interaction.editReply('🗳️ Vote registered!');

      if (currentGame.votes.size === currentGame.players.length) {
        await endVoting(interaction.channel);
      }
    }

    /* -------- FORCE END -------- */
    if (interaction.customId === 'end_game') {
      resetGame();
      return interaction.reply('🛑 Game forcefully ended.');
    }
  },

  /* ============================
     MODAL SUBMIT
  ============================ */
  async handleModalSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const generalQuestion = interaction.fields.getTextInputValue('general_question');
    const imposterQuestion = interaction.fields.getTextInputValue('imposter_question');

    const imposRole = interaction.guild.roles.cache.find(r => r.name === 'impos');

    if (!imposRole || imposRole.members.size === 0) {
      return interaction.editReply('❌ No players with impos role.');
    }

    const members = Array.from(imposRole.members.values());
    const imposter = members[Math.floor(Math.random() * members.length)];

    currentGame.active = true;
    currentGame.imposterId = imposter.id;
    currentGame.players = members.map(m => ({
      id: m.id,
      username: m.user.username
    }));
    currentGame.answers.clear();
    currentGame.votes.clear();
    currentGame.votingActive = false;
    currentGame.roleId = imposRole.id;

    // Send DMs
    for (const m of members) {
      const embed = new EmbedBuilder()
        .setTitle('📩 Your Question')
        .setColor('#575757')
        .setDescription(
          m.id === imposter.id ? imposterQuestion : generalQuestion
        );

      await m.send({ embeds: [embed] }).catch(() => {});
    }

    await interaction.editReply('✅ Questions sent!');

    // ANSWER ROUND START
    await interaction.channel.send({
      content: `<@&${imposRole.id}> 📝 **Answer Round Started!**\nYou have **90 seconds** to answer in this channel.`,
      allowedMentions: { parse: ['roles'] }
    });

    startAnswerCollector(interaction.channel);
  }
};

/* ============================
   ANSWER ROUND
============================ */
function startAnswerCollector(channel) {
  const collector = channel.createMessageCollector({
    filter: m => currentGame.players.some(p => p.id === m.author.id),
    time: 90000
  });

  collector.on('collect', async msg => {
    if (currentGame.answers.has(msg.author.id)) return;

    currentGame.answers.set(msg.author.id, msg.content);
    await msg.react('✅').catch(() => {});
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
    .setTitle('🗳️ Voting Round')
    .setDescription('Vote who you think is the **IMPOSTER**')
    .setColor('#FF0000');

  const rows = [];
  let row = new ActionRowBuilder();

  for (const player of currentGame.players) {
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
    content: `<@&${currentGame.roleId}> 🗳️ **Voting has started!**`,
    embeds: [embed],
    components: rows,
    allowedMentions: { parse: ['roles'] }
  });
}

/* ============================
   END VOTING
============================ */
async function endVoting(channel) {
  currentGame.votingActive = false;

  const tally = {};
  currentGame.votes.forEach(id => {
    tally[id] = (tally[id] || 0) + 1;
  });

  const votedOutId = Object.keys(tally).reduce((a, b) =>
    tally[a] > tally[b] ? a : b
  );

  const isImposter = votedOutId === currentGame.imposterId;

  const embed = new EmbedBuilder()
    .setTitle('🚪 Player Eliminated')
    .setDescription(
      `<@${votedOutId}> was voted out!\n\n` +
      (isImposter ? '🔴 **IMPOSTER CAUGHT!**' : '🟢 **They were innocent.**')
    )
    .setColor(isImposter ? '#FF0000' : '#00FF00');

  await channel.send({ embeds: [embed] });

  resetGame();
}

/* ============================
   RESET
============================ */
function resetGame() {
  currentGame = {
    active: false,
    imposterId: null,
    players: [],
    answers: new Map(),
    votes: new Map(),
    votingActive: false,
    roleId: null
  };
}
