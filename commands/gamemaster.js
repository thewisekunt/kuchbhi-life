const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gamemaster')
    .setDescription('Open game master panel to send questions'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🎮 Game Master Panel')
      .setDescription('Click the buttons below to manage the game');

    const openQuestionsButton = new ButtonBuilder()
      .setCustomId('open_questions_modal')
      .setLabel('Open Questions Form')
      .setStyle(ButtonStyle.Primary);

    const startGameButton = new ButtonBuilder()
      .setCustomId('start_game')
      .setLabel('Start Game')
      .setStyle(ButtonStyle.Success);

    const endGameButton = new ButtonBuilder()
      .setCustomId('end_game')
      .setLabel('End Game')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(openQuestionsButton, startGameButton, endGameButton);

    return interaction.editReply({
      embeds: [embed],
      components: [row],
    });
  },

  async handleButtonClick(interaction) {
    if (interaction.customId === 'open_questions_modal') {
      const modal = new ModalBuilder()
        .setCustomId('game_questions_modal')
        .setTitle('Game Questions');

      const generalQuestion = new TextInputBuilder()
        .setCustomId('general_question')
        .setLabel('General Question')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter a question for all players')
        .setRequired(true);

      const imposterQuestion = new TextInputBuilder()
        .setCustomId('imposter_question')
        .setLabel('Imposter Question')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Enter a question for the imposter only')
        .setRequired(true);

      const row1 = new ActionRowBuilder().addComponents(generalQuestion);
      const row2 = new ActionRowBuilder().addComponents(imposterQuestion);

      modal.addComponents(row1, row2);
      await interaction.showModal(modal);
    } else if (interaction.customId === 'start_game') {
      try {
        const imposRole = interaction.guild.roles.cache.find(r => r.name === 'impos');
        
        if (!imposRole || imposRole.members.size === 0) {
          return interaction.reply({
            content: '❌ No members with the impos role found. No game to start!',
            ephemeral: true,
          });
        }

        const membersWithRole = Array.from(imposRole.members.values());
        const membersList = membersWithRole.map(member => `• ${member.user.username}`).join('\n');

        const embed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('🎮 Game Started!')
          .setDescription(`**Players in the game:**\n${membersList}`)
          .setFooter({ text: `Total players: ${membersWithRole.length}` })
          .setTimestamp();

        await interaction.reply({
          embeds: [embed],
          ephemeral: false,
        });

        // Wait 15 seconds then ping the impos role
        setTimeout(async () => {
          try {
            await interaction.channel.send({
              content: `<@&${imposRole.id}> Write your answers according to your question`,
              allowedMentions: { parse: ['roles'] }
            });
          } catch (error) {
            console.error('Error sending ping message:', error);
          }
        }, 15000);
      } catch (error) {
        console.error('Error starting game:', error);
        await interaction.reply({
          content: '❌ Failed to start the game. Please try again.',
          ephemeral: true,
        });
      }
    } else if (interaction.customId === 'end_game') {
      try {
        const imposRole = interaction.guild.roles.cache.find(r => r.name === 'impos');
        
        if (!imposRole) {
          return interaction.reply({
            content: '❌ The impos role does not exist.',
            ephemeral: true,
          });
        }

        if (imposRole.members.size === 0) {
          return interaction.reply({
            content: '❌ No members with the impos role found. No game to end!',
            ephemeral: true,
          });
        }

        const membersWithRole = Array.from(imposRole.members.values());

        // Remove role from all members
        for (const member of membersWithRole) {
          try {
            await member.roles.remove(imposRole);
          } catch (error) {
            console.error(`Failed to remove role from ${member.user.username}:`, error);
          }
        }

        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('🎮 Game Ended')
          .setDescription(`**Game has ended!**\n\nRemoved the impos role from ${membersWithRole.length} player(s).`)
          .setTimestamp();

        await interaction.reply({
          embeds: [embed],
          ephemeral: false,
        });
      } catch (error) {
        console.error('Error ending game:', error);
        await interaction.reply({
          content: '❌ Failed to end the game. Please try again.',
          ephemeral: true,
        });
      }
    }
  },

  // Add these to your handleModalSubmit inside gamemaster.js
async handleModalSubmit(interaction) {
    const generalQuestion = interaction.fields.getTextInputValue('general_question');
    const imposterQuestion = interaction.fields.getTextInputValue('imposter_question');

    await interaction.deferReply({ ephemeral: true });

    const imposRole = interaction.guild.roles.cache.find(r => r.name === 'impos');
    if (!imposRole || imposRole.members.size < 3) {
        return interaction.editReply("❌ Need at least 3 players with the 'impos' role to start.");
    }

    const membersWithRole = Array.from(imposRole.members.values());
    const randomImposter = membersWithRole[Math.floor(Math.random() * membersWithRole.length)];

    // 1. Create the Thread
    const thread = await interaction.channel.threads.create({
        name: `🎮 Imposter Game - ${new Date().toLocaleTimeString()}`,
        autoArchiveDuration: 60,
        reason: 'Among Us Game Thread',
    });

    // 2. Add players and Ping
    for (const m of membersWithRole) { await thread.members.add(m.id); }
    await thread.send(`🎮 **The Game has started!**\n<@&${imposRole.id}> I have DM'd you your questions. You have 90 seconds to answer here!`);

    // 3. Send DMs
    for (const member of membersWithRole) {
        const isImposter = member.id === randomImposter.id;
        const embed = new EmbedBuilder()
            .setTitle('🕵️ Your Question')
            .setDescription(isImposter ? imposterQuestion : generalQuestion)
            .setColor(isImposter ? '#FF0000' : '#00FF00');
        
        await member.send({ embeds: [embed] }).catch(() => thread.send(`⚠️ Couldn't DM <@${member.id}>!`));
    }

    // 4. Save Game State to DB
    await db.query("INSERT INTO imposter_games (thread_id, imposter_id, general_question, imposter_question) VALUES (?, ?, ?, ?)", 
        [thread.id, randomImposter.id, generalQuestion, imposterQuestion]);

    // 5. Start 90s Answer Phase -> Then start Poll
    setTimeout(() => this.startVoting(thread, membersWithRole, randomImposter.id), 90000);

    await interaction.editReply(`✅ Game Thread Created: <#${thread.id}>`);
},

async startVoting(thread, players, imposterId) {
    const embed = new EmbedBuilder()
        .setTitle('🗳️ Voting Time!')
        .setDescription('Who is the imposter? React to the numbers below to vote!\n' + 
            players.map((p, i) => `${i + 1}️⃣ - ${p.user.username}`).join('\n'))
        .setColor('#FFA500');

    const pollMsg = await thread.send({ content: '🚨 **TIME IS UP!** Cast your votes now. (45 Seconds)', embeds: [embed] });
    
    const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];
    for (let i = 0; i < players.length; i++) { await pollMsg.react(emojis[i]); }

    // Wait 45s then Close Poll
    setTimeout(() => this.resolveGame(thread, pollMsg, players, imposterId), 45000);
}
