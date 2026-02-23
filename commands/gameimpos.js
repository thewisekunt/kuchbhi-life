const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle 
} = require('discord.js');
const db = require('../db');

// In-memory tracker for active games in the channel
const activeGames = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('imposter')
        .setDescription('🕵️ The Ultimate Imposter Game Manager')
        
        .addSubcommand(sub => sub
            .setName('setup')
            .setDescription('Open the panel to type questions and DM players')
        )
        .addSubcommand(sub => sub
            .setName('poll')
            .setDescription('Drop the voting poll in chat to guess the imposter')
        )
        .addSubcommand(sub => sub
            .setName('end')
            .setDescription('End the game and clear the impos role from everyone')
        )
        .addSubcommand(sub => sub
            .setName('leaderboard')
            .setDescription('Show the top Imposter Detectives')
        ),

    async execute(interaction) {
        const subCommand = interaction.options.getSubcommand();

        /* =========================================
           1. SETUP: OPEN MODAL & SEND DMs
        ========================================= */
        if (subCommand === 'setup') {
            // Check for the impos role
            const imposRole = interaction.guild.roles.cache.find(r => r.name === 'impos');
            
            if (!imposRole || imposRole.members.size === 0) {
                return interaction.reply({ content: '❌ No members with the `impos` role found. Assign the role first!', ephemeral: true });
            }

            // Build the Modal
            const modal = new ModalBuilder()
                .setCustomId('game_questions_modal')
                .setTitle('Game Questions Setup');

            const generalQuestion = new TextInputBuilder()
                .setCustomId('general_question')
                .setLabel('General Question (For Crewmates)')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Enter the question for normal players...')
                .setRequired(true);

            const imposterQuestion = new TextInputBuilder()
                .setCustomId('imposter_question')
                .setLabel('Imposter Question (For Imposter Only)')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Enter the question for the imposter...')
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(generalQuestion),
                new ActionRowBuilder().addComponents(imposterQuestion)
            );

            // Show the Modal
            await interaction.showModal(modal);

            try {
                // Wait for the Gamemaster to submit the modal (5 minute timeout)
                const modalSubmit = await interaction.awaitModalSubmit({
                    filter: i => i.customId === 'game_questions_modal' && i.user.id === interaction.user.id,
                    time: 300000 
                });

                await modalSubmit.deferReply(); // Hide loading state

                const genQ = modalSubmit.fields.getTextInputValue('general_question');
                const impQ = modalSubmit.fields.getTextInputValue('imposter_question');

                const players = Array.from(imposRole.members.values());
                const randomImposter = players[Math.floor(Math.random() * players.length)];

                let failedDMs = [];

                // Send DMs
                for (const member of players) {
                    try {
                        if (member.id === randomImposter.id) {
                            // Imposter DM
                            const impEmbed = new EmbedBuilder()
                                .setColor('#e74c3c')
                                .setTitle('🤫 YOU ARE THE IMPOSTER')
                                .setDescription(`**Your Question:**\n${impQ}`)
                                .setFooter({ text: 'Blend in and act natural!' });
                            await member.send({ embeds: [impEmbed] });
                        } else {
                            // Crewmate DM
                            const genEmbed = new EmbedBuilder()
                                .setColor('#2ecc71')
                                .setTitle('✅ YOU ARE A CREWMATE')
                                .setDescription(`**Your Question:**\n${genQ}`)
                                .setFooter({ text: 'Find out who has the weird question!' });
                            await member.send({ embeds: [genEmbed] });
                        }
                    } catch (err) {
                        failedDMs.push(member.user.username);
                    }
                }

                // Save game state for the poll later
                activeGames.set(interaction.channelId, {
                    gamemaster: interaction.user.id,
                    imposter: randomImposter.id,
                    players: players,
                    votes: new Map() // Tracks who voted for who
                });

                let responseMsg = `✅ **Game Started!**\n📋 **General Q** sent to ${players.length - 1} players.\n🔴 **Imposter Q** sent to 1 player.`;
                if (failedDMs.length > 0) {
                    responseMsg += `\n⚠️ *Could not DM: ${failedDMs.join(', ')} (DMs closed).*`;
                }

                await modalSubmit.editReply({ content: responseMsg });

                // Ping the channel after 10 seconds
                setTimeout(async () => {
                    await interaction.channel.send(`🕵️ <@&${imposRole.id}> Check your DMs and answer your questions here!`);
                }, 10000);

            } catch (err) {
                // Modal timed out or user closed it
                console.log("Modal timeout or error:", err);
            }
        }

        /* =========================================
           2. POLL: VOTING & REVEAL
        ========================================= */
        else if (subCommand === 'poll') {
            const game = activeGames.get(interaction.channelId);

            if (!game) {
                return interaction.reply({ content: "❌ No active game found. Use `/imposter setup` first.", ephemeral: true });
            }
            if (interaction.user.id !== game.gamemaster) {
                return interaction.reply({ content: "❌ Only the Gamemaster can start the poll.", ephemeral: true });
            }

            // Limit to 25 players (Discord Select Menu limit)
            const safePlayers = game.players.slice(0, 25);

            const options = safePlayers.map(p => ({
                label: p.user.username,
                value: p.id,
                description: `Vote for ${p.user.username}`
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('imposter_vote')
                .setPlaceholder('Select who you think the Imposter is...')
                .addOptions(options);

            const revealBtn = new ButtonBuilder()
                .setCustomId('imposter_reveal')
                .setLabel('🚨 Reveal Imposter')
                .setStyle(ButtonStyle.Danger);

            const row1 = new ActionRowBuilder().addComponents(selectMenu);
            const row2 = new ActionRowBuilder().addComponents(revealBtn);

            const embed = new EmbedBuilder()
                .setTitle('🗳️ Time to Vote!')
                .setDescription('Who is the imposter? Select a name below. You can change your vote until the Gamemaster clicks Reveal.')
                .setColor('#f1c40f');

            const pollMessage = await interaction.reply({ embeds: [embed], components: [row1, row2], fetchReply: true });

            // Create Collector for Votes and Reveal (Valid for 15 minutes)
            const collector = pollMessage.createMessageComponentCollector({ time: 900000 }); 

            collector.on('collect', async i => {
                // HANDLE VOTING
                if (i.customId === 'imposter_vote') {
                    const voterId = i.user.id;
                    const votedForId = i.values[0];
                    
                    if (!game.players.find(p => p.id === voterId)) {
                        return i.reply({ content: "❌ You are not playing in this game!", ephemeral: true });
                    }

                    game.votes.set(voterId, votedForId);
                    await i.reply({ content: `✅ Vote cast! You voted for <@${votedForId}>.`, ephemeral: true });
                }

                // HANDLE REVEAL (Only GM can click)
                if (i.customId === 'imposter_reveal') {
                    if (i.user.id !== game.gamemaster) {
                        return i.reply({ content: "❌ Only the Gamemaster can reveal the imposter!", ephemeral: true });
                    }

                    collector.stop('revealed');

                    const winners = [];
                    const voteTally = [];

                    game.votes.forEach((votedForId, voterId) => {
                        const voter = game.players.find(p => p.id === voterId);
                        const votedFor = game.players.find(p => p.id === votedForId);
                        
                        voteTally.push(`• **${voter?.user.username}** voted for **${votedFor?.user.username}**`);

                        if (votedForId === game.imposter) {
                            winners.push(voterId);
                        }
                    });

                    // Update Database Leaderboard for Winners
                    if (winners.length > 0) {
                        try {
                            const placeholders = winners.map(() => '?').join(',');
                            await db.query(
                                `UPDATE users SET imposter_guesses = imposter_guesses + 1 WHERE discord_id IN (${placeholders})`,
                                winners
                            );
                        } catch (err) {
                            console.error("DB Error updating imposter wins:", err);
                        }
                    }

                    const revealEmbed = new EmbedBuilder()
                        .setTitle('🚨 THE IMPOSTER IS REVEALED!')
                        .setDescription(`The imposter was <@${game.imposter}>!`)
                        .setColor('#e74c3c')
                        .addFields(
                            { name: '🗳️ How everyone voted:', value: voteTally.length > 0 ? voteTally.join('\n') : 'Nobody voted!' },
                            { name: '🏆 Winners (+1 Point):', value: winners.length > 0 ? winners.map(id => `<@${id}>`).join(', ') : 'The Imposter fooled everyone!' }
                        );

                    await i.update({ embeds: [revealEmbed], components: [] }); 
                    activeGames.delete(interaction.channelId); // Clear game
                }
            });

            collector.on('end', (collected, reason) => {
                if (reason === 'time') {
                    interaction.editReply({ content: "⏳ Voting timed out.", components: [] }).catch(()=>{});
                    activeGames.delete(interaction.channelId);
                }
            });
        }

        /* =========================================
           3. END GAME: CLEAR ROLES
        ========================================= */
        else if (subCommand === 'end') {
            await interaction.deferReply();
            
            const imposRole = interaction.guild.roles.cache.find(r => r.name === 'impos');
            if (!imposRole) {
                return interaction.editReply('❌ The `impos` role does not exist.');
            }

            const membersWithRole = Array.from(imposRole.members.values());
            if (membersWithRole.length === 0) {
                return interaction.editReply('❌ No members currently have the `impos` role.');
            }

            for (const member of membersWithRole) {
                try { await member.roles.remove(imposRole); } 
                catch (error) { console.error(`Failed to remove role from ${member.user.username}`); }
            }

            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('🛑 Game Ended')
                .setDescription(`Removed the \`impos\` role from **${membersWithRole.length}** player(s).`)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }

        /* =========================================
           4. LEADERBOARD
        ========================================= */
        else if (subCommand === 'leaderboard') {
            await interaction.deferReply();

            try {
                const [topPlayers] = await db.query(`
                    SELECT username, imposter_guesses 
                    FROM users 
                    WHERE imposter_guesses > 0 
                    ORDER BY imposter_guesses DESC 
                    LIMIT 10
                `);

                if (topPlayers.length === 0) {
                    return interaction.editReply("No one has successfully guessed an imposter yet! Play a game to get on the board.");
                }

                const embed = new EmbedBuilder()
                    .setTitle('🕵️ Top Imposter Detectives')
                    .setColor('#3498db')
                    .setDescription('The smartest players who always guess the imposter correctly:');

                let lbText = '';
                topPlayers.forEach((player, index) => {
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🔹';
                    lbText += `${medal} **${player.username}** — ${player.imposter_guesses} Correct Guesses\n`;
                });

                embed.addFields({ name: 'Leaderboard', value: lbText });

                await interaction.editReply({ embeds: [embed] });

            } catch (err) {
                console.error(err);
                await interaction.editReply("❌ Database error loading leaderboard.");
            }
        }
    }
};
