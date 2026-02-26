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

// In-memory tracker for active games per channel
const activeGames = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('imposter')
        .setDescription('🕵️ Play the Multi-Round Imposter Game!')
        .addSubcommand(sub => sub.setName('host').setDescription('Create a new game lobby'))
        .addSubcommand(sub => sub.setName('join').setDescription('Join the current lobby'))
        .addSubcommand(sub => sub.setName('leave').setDescription('Leave the lobby'))
        .addSubcommand(sub => sub.setName('start').setDescription('Host only: Start game and assign roles'))
        .addSubcommand(sub => sub.setName('poll').setDescription('Host only: Start a voting round'))
        .addSubcommand(sub => sub.setName('end').setDescription('Host only: Force end the game'))
        .addSubcommand(sub => sub.setName('lb').setDescription('View the Top Detectives leaderboard')),

    async execute(interaction) {
        const subCommand = interaction.options.getSubcommand();
        const channelId = interaction.channelId;
        const userId = interaction.user.id;
        const game = activeGames.get(channelId);

        /* =========================================
           1. LOBBY COMMANDS (Host, Join, Leave)
        ========================================= */
        if (subCommand === 'host') {
            if (game) return interaction.reply({ content: "❌ A game is already active in this channel!", ephemeral: true });

            activeGames.set(channelId, {
                status: 'LOBBY',
                host: userId,
                players: [interaction.user], // Store full user objects
                alive: [], 
                imposter: null,
                votes: new Map()
            });

            const embed = new EmbedBuilder()
                .setTitle('🛋️ Imposter Lobby Created!')
                .setDescription(`**Host:** <@${userId}>\n\nType \`/imposter join\` to play!`)
                .setColor('#3498db');

            return interaction.reply({ embeds: [embed] });
        }

        if (subCommand === 'join') {
            if (!game) return interaction.reply({ content: "❌ No lobby found. Tell someone to `/imposter host`.", ephemeral: true });
            if (game.status !== 'LOBBY') return interaction.reply({ content: "❌ Game is already in progress!", ephemeral: true });
            if (game.players.find(p => p.id === userId)) return interaction.reply({ content: "❌ You are already in the lobby!", ephemeral: true });

            game.players.push(interaction.user);
            return interaction.reply(`✅ <@${userId}> joined the game! (${game.players.length} Players)`);
        }

        if (subCommand === 'leave') {
            if (!game) return interaction.reply({ content: "❌ No game active.", ephemeral: true });
            if (game.status !== 'LOBBY') return interaction.reply({ content: "❌ You can't leave a game in progress! Surrender instead.", ephemeral: true });
            
            const playerIndex = game.players.findIndex(p => p.id === userId);
            if (playerIndex === -1) return interaction.reply({ content: "❌ You are not in the lobby.", ephemeral: true });

            if (game.host === userId) {
                activeGames.delete(channelId);
                return interaction.reply(`🛑 The Host left. The lobby has been closed.`);
            }

            game.players.splice(playerIndex, 1);
            return interaction.reply(`🚪 <@${userId}> left the lobby. (${game.players.length} Players left)`);
        }

        /* =========================================
           2. START GAME (Questions & DMs)
        ========================================= */
        if (subCommand === 'start') {
            if (!game) return interaction.reply({ content: "❌ No lobby found.", ephemeral: true });
            if (game.host !== userId) return interaction.reply({ content: "❌ Only the Host can start the game.", ephemeral: true });
            if (game.status !== 'LOBBY') return interaction.reply({ content: "❌ Game already started.", ephemeral: true });
            if (game.players.length < 3) return interaction.reply({ content: "❌ You need at least 3 players to start!", ephemeral: true });

            // Create Setup Modal
            const modal = new ModalBuilder()
                .setCustomId('imp_start_modal')
                .setTitle('Setup Game Questions');

            modal.addComponents(
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('gen_q').setLabel('Crewmate Question').setStyle(TextInputStyle.Paragraph).setRequired(true)),
                new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('imp_q').setLabel('Imposter Question').setStyle(TextInputStyle.Paragraph).setRequired(true))
            );

            await interaction.showModal(modal);

            try {
                // Wait for Modal Submit
                const submit = await interaction.awaitModalSubmit({ filter: i => i.customId === 'imp_start_modal' && i.user.id === userId, time: 300000 });
                await submit.deferReply();

                const genQ = submit.fields.getTextInputValue('gen_q');
                const impQ = submit.fields.getTextInputValue('imp_q');

                // Pick Imposter & Set Alive Status
                const randomImposter = game.players[Math.floor(Math.random() * game.players.length)];
                game.imposter = randomImposter.id;
                game.alive = game.players.map(p => p.id); // Everyone starts alive
                game.status = 'PLAYING';

                let failedDMs = [];
                for (const p of game.players) {
                    try {
                        if (p.id === randomImposter.id) {
                            await p.send({ embeds: [new EmbedBuilder().setColor('#e74c3c').setTitle('🤫 YOU ARE THE IMPOSTER').setDescription(`**Your Question:**\n${impQ}`)] });
                        } else {
                            await p.send({ embeds: [new EmbedBuilder().setColor('#2ecc71').setTitle('✅ YOU ARE A CREWMATE').setDescription(`**Your Question:**\n${genQ}`)] });
                        }
                    } catch (e) { failedDMs.push(p.username); }
                }

                let msg = `✅ **Game Started with ${game.players.length} players!** Roles have been sent in DMs. Discuss in chat, then the host will run \`/imposter poll\`.`;
                if (failedDMs.length > 0) msg += `\n⚠️ *Could not DM: ${failedDMs.join(', ')}*`;
                
                await submit.editReply(msg);
            } catch (err) {
                console.log("Modal timeout");
            }
        }

        /* =========================================
           3. POLL & MULTI-ROUND ELIMINATION
        ========================================= */
        if (subCommand === 'poll') {
            if (!game) return interaction.reply({ content: "❌ No game found.", ephemeral: true });
            if (game.host !== userId) return interaction.reply({ content: "❌ Only the Host can run a poll.", ephemeral: true });
            if (game.status !== 'PLAYING') return interaction.reply({ content: "❌ The game is not in the playing phase.", ephemeral: true });

            game.votes.clear(); // Reset votes for this round

            // Create options ONLY for ALIVE players
            const options = game.players
                .filter(p => game.alive.includes(p.id))
                .map(p => ({ label: p.username, value: p.id }));

            const menu = new StringSelectMenuBuilder().setCustomId('imp_vote').setPlaceholder('Vote to eliminate...').addOptions(options);
            const tallyBtn = new ButtonBuilder().setCustomId('imp_tally').setLabel('⚖️ Tally Votes').setStyle(ButtonStyle.Danger);

            const embed = new EmbedBuilder()
                .setTitle(`🗳️ Round Voting! (${game.alive.length} Players Alive)`)
                .setDescription('Select who you think the Imposter is. The person with the most votes is eliminated!')
                .setColor('#f1c40f');

            const pollMsg = await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(tallyBtn)], fetchReply: true });

            // Collect Votes
            const collector = pollMsg.createMessageComponentCollector({ time: 600000 });

            collector.on('collect', async i => {
                if (i.customId === 'imp_vote') {
                    if (!game.alive.includes(i.user.id)) return i.reply({ content: "❌ Dead players can't vote!", ephemeral: true });
                    game.votes.set(i.user.id, i.values[0]);
                    await i.reply({ content: `✅ You voted to eliminate <@${i.values[0]}>.`, ephemeral: true });
                }

                if (i.customId === 'imp_tally') {
                    if (i.user.id !== game.host) return i.reply({ content: "❌ Only the Host can tally.", ephemeral: true });
                    collector.stop('tallied');

                    // 1. Count Votes
                    let voteCounts = {};
                    let voteLog = [];
                    game.votes.forEach((votedForId, voterId) => {
                        voteCounts[votedForId] = (voteCounts[votedForId] || 0) + 1;
                        voteLog.push(`• <@${voterId}> voted for <@${votedForId}>`);
                    });

                    // 2. Find Highest Vote
                    let maxVotes = 0;
                    let eliminatedId = null;
                    let tie = false;

                    for (const [vId, count] of Object.entries(voteCounts)) {
                        if (count > maxVotes) { maxVotes = count; eliminatedId = vId; tie = false; }
                        else if (count === maxVotes) { tie = true; }
                    }

                    const tallyEmbed = new EmbedBuilder().setTitle('⚖️ Voting Results').addFields({ name: 'Votes Cast', value: voteLog.length > 0 ? voteLog.join('\n') : 'No one voted!' });

                    // 3. Process Elimination
                    if (tie || !eliminatedId) {
                        tallyEmbed.setColor('#95a5a6').setDescription('**It was a tie! No one was eliminated this round.**\nDiscuss and run `/imposter poll` again.');
                        await i.update({ embeds: [tallyEmbed], components: [] });
                        return;
                    }

                    // Remove player
                    game.alive = game.alive.filter(id => id !== eliminatedId);

                    // A. DID THEY VOTE OUT THE IMPOSTER?
                    if (eliminatedId === game.imposter) {
                        tallyEmbed.setColor('#2ecc71').setDescription(`🎉 **<@${eliminatedId}> was eliminated... and they WERE the Imposter!**\n\n**CREWMATES WIN!**`);
                        
                        // Add points to everyone who voted for the imposter
                        let correctVoters = [];
                        game.votes.forEach((votedForId, voterId) => {
                            if (votedForId === game.imposter) correctVoters.push(voterId);
                        });

                        if (correctVoters.length > 0) {
                            const placeholders = correctVoters.map(() => '?').join(',');
                            await db.query(`UPDATE users SET imposter_guesses = imposter_guesses + 1 WHERE discord_id IN (${placeholders})`, correctVoters).catch(()=>{});
                            tallyEmbed.addFields({ name: '🏆 +1 Point Awarded To:', value: correctVoters.map(id => `<@${id}>`).join(', ') });
                        }

                        activeGames.delete(channelId);
                    } 
                    // B. DID THEY VOTE OUT A CREWMATE?
                    else {
                        tallyEmbed.setColor('#e74c3c').setDescription(`💀 **<@${eliminatedId}> was eliminated... but they were NOT the Imposter!**`);

                        // Check if Imposter Wins (1v1 scenario)
                        if (game.alive.length <= 2 && game.alive.includes(game.imposter)) {
                            tallyEmbed.addFields({ name: '🚨 GAME OVER', value: `There are not enough crewmates left to vote out the Imposter (<@${game.imposter}>).\n**IMPOSTER WINS!**`});
                            activeGames.delete(channelId);
                        } else {
                            tallyEmbed.addFields({ name: '🔄 The Game Continues', value: `${game.alive.length} players remain. Discuss and host can run \`/imposter poll\` again.`});
                        }
                    }

                    await i.update({ embeds: [tallyEmbed], components: [] });
                }
            });
        }

        /* =========================================
           4. END & LEADERBOARD
        ========================================= */
        if (subCommand === 'end') {
            if (!game) return interaction.reply({ content: "❌ No game active.", ephemeral: true });
            if (game.host !== userId && !interaction.member.permissions.has('ManageGuild')) return interaction.reply({ content: "❌ Only Host or Admin can force end.", ephemeral: true });
            
            activeGames.delete(channelId);
            return interaction.reply("🛑 **Game forcibly ended by the Host.**");
        }

        if (subCommand === 'lb') {
            await interaction.deferReply();
            try {
                const [tops] = await db.query("SELECT username, imposter_guesses FROM users WHERE imposter_guesses > 0 ORDER BY imposter_guesses DESC LIMIT 10");
                if (tops.length === 0) return interaction.editReply("No one has won a game yet!");
                
                let txt = '';
                tops.forEach((t, i) => {
                    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🔹';
                    txt += `${medal} **${t.username}** — ${t.imposter_guesses} Wins\n`;
                });
                const embed = new EmbedBuilder().setTitle('🕵️ Top Detectives').setDescription(txt).setColor('#3498db');
                await interaction.editReply({ embeds: [embed] });
            } catch (err) { await interaction.editReply('❌ DB Error.'); }
        }
    }
};
