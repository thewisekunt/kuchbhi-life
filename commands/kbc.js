const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const db = require('../db');

// The Prize Ladder for the 10 Questions
const PRIZE_LADDER = [100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000, 5000000];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kbc')
        .setDescription('🧠 Start a game of Kuch Bhi Crorepati!')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild), // Admin only to host

    async execute(interaction) {
        // FOOLPROOF DEFER FIX: Checks if index.js already deferred it to prevent crashes!
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply().catch(() => {});
        }

        try {
            // ==========================================
            // PHASE 1: FASTEST FINGER FIRST (FFF)
            // ==========================================
            const [fffRows] = await db.query("SELECT * FROM kbc_questions WHERE type = 'FFF' ORDER BY RAND() LIMIT 1");
            const fffQ = fffRows[0];
            
            if (!fffQ) {
                return interaction.editReply('❌ No FFF questions found in the database! Add some via the Admin website.');
            }

            const fffEmbed = new EmbedBuilder()
                .setTitle('⏱️ FASTEST FINGER FIRST!')
                .setDescription(`**${fffQ.question}**\n\n**A)** ${fffQ.opt_a}\n**B)** ${fffQ.opt_b}\n**C)** ${fffQ.opt_c}\n**D)** ${fffQ.opt_d}\n\n*You have 15 seconds! The fastest correct answer gets to play the main game!*`)
                .setColor('#e74c3c');

            const fffRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('A').setLabel('A').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('B').setLabel('B').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('C').setLabel('C').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('D').setLabel('D').setStyle(ButtonStyle.Primary)
            );

            // Fetch the reply so we can attach a collector to it
            const fffMsg = await interaction.editReply({ embeds: [fffEmbed], components: [fffRow], fetchReply: true });

            // Collect clicks for 15 seconds
            const filter = i => ['A', 'B', 'C', 'D'].includes(i.customId);
            const collector = fffMsg.createMessageComponentCollector({ filter, time: 15000 });
            
            const clicks = new Map();
            const startTime = Date.now();

            collector.on('collect', async i => {
                if (!clicks.has(i.user.id)) {
                    // Record their first answer and their exact reaction time in seconds
                    clicks.set(i.user.id, { 
                        answer: i.customId, 
                        time: (Date.now() - startTime) / 1000,
                        user: i.user 
                    });
                    await i.reply({ content: `You locked in **${i.customId}** in ${((Date.now() - startTime) / 1000).toFixed(2)}s!`, flags: 64 });
                } else {
                    await i.reply({ content: 'You already answered!', flags: 64 });
                }
            });

            collector.on('end', async () => {
                // Find all correct answers and sort by time
                const correctPlayers = Array.from(clicks.values())
                    .filter(data => data.answer === fffQ.correct_opt)
                    .sort((a, b) => a.time - b.time);

                if (correctPlayers.length === 0) {
                    return interaction.followUp(`⏰ Time is up! Nobody got the correct answer (which was **${fffQ.correct_opt}**).`);
                }

                const winner = correctPlayers[0];
                
                // Show top 10 fastest reaction times
                let leaderboardStr = correctPlayers.slice(0, 10).map((p, index) => 
                    `${index === 0 ? '🥇' : '👤'} **${p.user.username}** — ${p.time.toFixed(2)}s`
                ).join('\n');

                const winEmbed = new EmbedBuilder()
                    .setTitle('🎉 WE HAVE A WINNER!')
                    .setDescription(`The correct answer was **${fffQ.correct_opt}**!\n\n**Contestant Reaction Times:**\n${leaderboardStr}\n\n🎊 <@${winner.user.id}> moves on to the Hot Seat!`)
                    .setColor('#2ecc71');

                await interaction.followUp({ embeds: [winEmbed], components: [] });

                // Delay briefly, then start main game
                setTimeout(() => startMainGame(interaction, winner.user), 5000);
            });

        } catch (err) {
            console.error('KBC Error:', err);
            interaction.editReply('❌ A database error occurred.');
        }
    }
};

// ==========================================
// PHASE 2: MAIN GAME ENGINE (COLLECTOR BASED)
// ==========================================
async function startMainGame(interaction, player) {
    let currentLevel = 1; // 1 to 10
    let winnings = 0;
    
    // Lifeline trackers
    let lifelines = { fifty: true, poll: true, swap: true };

    await playLevel(interaction, player, currentLevel, winnings, lifelines);
}

async function playLevel(interaction, player, level, winnings, lifelines) {
    try {
        // 1. Fetch a question matching the current difficulty level
        const [qDataRows] = await db.execute("SELECT * FROM kbc_questions WHERE type = 'MAIN' AND difficulty = ? ORDER BY RAND() LIMIT 1", [level]);
        const qData = qDataRows[0];
        
        if (!qData) {
            await giveMoney(player.id, winnings);
            return interaction.channel.send(`⚠️ Error: No questions found for Difficulty Level ${level}. The game must end early! You win **₹${winnings.toLocaleString()}**!`);
        }

        const prize = PRIZE_LADDER[level - 1];

        // 2. Build the Embed
        const embed = new EmbedBuilder()
            .setTitle(`Question ${level} for ₹${prize.toLocaleString()}`)
            .setDescription(`**${qData.question}**\n\n**A)** ${qData.opt_a}\n**B)** ${qData.opt_b}\n**C)** ${qData.opt_c}\n**D)** ${qData.opt_d}`)
            .setColor('#3498db')
            .setFooter({ text: `Current Winnings: ₹${winnings.toLocaleString()} | Player: ${player.username}`, iconURL: player.displayAvatarURL() });

        // 3. Build Answer Buttons
        const answersRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`opt_A_${level}`).setLabel('A').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`opt_B_${level}`).setLabel('B').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`opt_C_${level}`).setLabel('C').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`opt_D_${level}`).setLabel('D').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`quit_${level}`).setLabel('🚶 Quit').setStyle(ButtonStyle.Danger)
        );

        // 4. Build Lifeline Buttons
        const lifelinesRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ll_fifty_${level}`).setLabel('50:50').setStyle(ButtonStyle.Success).setDisabled(!lifelines.fifty),
            new ButtonBuilder().setCustomId(`ll_poll_${level}`).setLabel('👥 Poll').setStyle(ButtonStyle.Success).setDisabled(!lifelines.poll),
            new ButtonBuilder().setCustomId(`ll_swap_${level}`).setLabel('🔄 Swap').setStyle(ButtonStyle.Success).setDisabled(!lifelines.swap)
        );

        const msg = await interaction.channel.send({ content: `<@${player.id}>, your next question is here! You have 60 seconds.`, embeds: [embed], components: [answersRow, lifelinesRow] });

        // 5. Create the highly-stable Message Collector
        const collector = msg.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async i => {
            // ANTI-SNIPE: Ignore anyone who isn't the active player
            if (i.user.id !== player.id) {
                return i.reply({ content: "It's not your turn on the Hot Seat!", flags: 64 });
            }

            const parts = i.customId.split('_');
            const action = parts[0]; 
            const opt = parts[1];

            try {
                // --- HANDLE QUIT ---
                if (action === 'quit') {
                    collector.stop('quit');
                    await giveMoney(player.id, winnings);
                    await i.update({ components: [] });
                    return interaction.channel.send(`🚶 <@${player.id}> decided to walk away! They take home **₹${winnings.toLocaleString()}**!`);
                }

                // --- HANDLE LIFELINES ---
                if (action === 'll') {
                    if (opt === 'fifty') {
                        lifelines.fifty = false;
                        const wrongOpts = ['A', 'B', 'C', 'D'].filter(o => o !== qData.correct_opt);
                        const hide = wrongOpts.sort(() => 0.5 - Math.random()).slice(0, 2);
                        
                        answersRow.components.forEach(comp => {
                            const compOpt = comp.data.custom_id.split('_')[1];
                            if (hide.includes(compOpt)) {
                                comp.setDisabled(true).setLabel('---');
                            }
                        });
                        lifelinesRow.components[0].setDisabled(true); 
                        
                        return i.update({ content: `<@${player.id}>, **50:50 Used!** Two wrong answers removed.`, components: [answersRow, lifelinesRow] });
                    }

                    if (opt === 'poll') {
                        lifelines.poll = false;
                        lifelinesRow.components[1].setDisabled(true); 
                        
                        let p = { A: 10, B: 10, C: 10, D: 10 };
                        p[qData.correct_opt] = 60 + Math.floor(Math.random() * 20); 
                        const pollText = `👥 **Audience Poll Results:**\nA: ${p.A}%\nB: ${p.B}%\nC: ${p.C}%\nD: ${p.D}%`;
                        
                        await i.update({ components: [answersRow, lifelinesRow] });
                        return interaction.channel.send(pollText);
                    }

                    if (opt === 'swap') {
                        lifelines.swap = false;
                        collector.stop('swap'); // Stop this collector so we don't duplicate events
                        await i.update({ content: '🔄 **Swapping Question...**', embeds: [], components: [] });
                        return playLevel(interaction, player, level, winnings, lifelines);
                    }
                }

                // --- HANDLE ANSWERS ---
                if (action === 'opt') {
                    collector.stop('answered'); // Stop collector so time doesn't run out while processing
                    
                    if (opt === qData.correct_opt) {
                        await i.update({ components: [] });
                        await interaction.channel.send(`✅ **CORRECT!** You won **₹${prize.toLocaleString()}**!`);
                        
                        if (level === 10) {
                            await giveMoney(player.id, prize);
                            return interaction.channel.send(`🎉🎉 **ABSOLUTE MADNESS! <@${player.id}> HAS ANSWERED ALL 10 QUESTIONS AND WON ₹${prize.toLocaleString()}!!** 🎉🎉`);
                        } else {
                            setTimeout(() => playLevel(interaction, player, level + 1, prize, lifelines), 3000);
                        }
                    } else {
                        // WRONG ANSWER
                        await i.update({ components: [] });
                        let fallback = 0;
                        if (level > 5) fallback = PRIZE_LADDER[4]; // Checkpoint at Q5 (10,000)

                        await giveMoney(player.id, fallback);
                        return interaction.channel.send(`❌ **WRONG ANSWER!** The correct answer was **${qData.correct_opt}**. \n\n<@${player.id}> drops down and leaves with **₹${fallback.toLocaleString()}**.`);
                    }
                }

            } catch (err) {
                console.error("Button Logic Error:", err);
            }
        });

        // If the 60 seconds run out without them picking an answer or quitting
        collector.on('end', (collected, reason) => {
            if (reason === 'time') {
                msg.edit({ components: [] }).catch(()=>{});
                giveMoney(player.id, winnings);
                interaction.channel.send(`⏰ Time's up! <@${player.id}> took too long. They leave with **₹${winnings.toLocaleString()}**.`);
            }
        });

    } catch (e) {
        console.error("PlayLevel Error:", e);
    }
}

// Helper to write winnings to Database
async function giveMoney(discordId, amount) {
    if (amount <= 0) return;
    try {
        await db.execute(`
            UPDATE economy e 
            JOIN users u ON e.user_id = u.id 
            SET e.balance = e.balance + ? 
            WHERE u.discord_id = ?
        `, [amount, discordId]);
    } catch(e) { 
        console.error("Money Error:", e); 
    }
}
