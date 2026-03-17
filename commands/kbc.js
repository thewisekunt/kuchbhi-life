const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const db = require('../db');

const PRIZE_LADDER = [100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000, 5000000];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kbc')
        .setDescription('🧠 Start a game of Kuch Bhi Crorepati!')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        if (interaction.deferred || interaction.replied) return;
        await interaction.deferReply();

        try {
            // PHASE 1: FASTEST FINGER FIRST
            const [fffRows] = await db.query("SELECT * FROM kbc_questions WHERE type = 'FFF' ORDER BY RAND() LIMIT 1");
            const fffQ = fffRows[0];
            if (!fffQ) return interaction.editReply('❌ No FFF questions found in the database!');

            const fffEmbed = new EmbedBuilder()
                .setTitle('⏱️ FASTEST FINGER FIRST!')
                .setDescription(`**${fffQ.question}**\n\nA) ${fffQ.opt_a}\nB) ${fffQ.opt_b}\nC) ${fffQ.opt_c}\nD) ${fffQ.opt_d}\n\n*Fastest correct answer moves to the Hot Seat!*`)
                .setColor('#e74c3c');

            const fffRow = new ActionRowBuilder().addComponents(
                ['A', 'B', 'C', 'D'].map(id => new ButtonBuilder().setCustomId(id).setLabel(id).setStyle(ButtonStyle.Primary))
            );

            const fffMsg = await interaction.editReply({ embeds: [fffEmbed], components: [fffRow] });

            const clicks = new Map();
            const startTime = Date.now();
            const collector = fffMsg.createMessageComponentCollector({ time: 15000 });

            collector.on('collect', async i => {
                if (clicks.has(i.user.id)) return i.reply({ content: 'Already answered!', ephemeral: true });
                clicks.set(i.user.id, { 
                    answer: i.customId, 
                    time: (Date.now() - startTime) / 1000, 
                    user: i.user 
                });
                await i.reply({ content: `Locked in **${i.customId}**!`, ephemeral: true });
            });

            collector.on('end', async () => {
                const correctPlayers = Array.from(clicks.values())
                    .filter(p => p.answer === fffQ.correct_opt)
                    .sort((a, b) => a.time - b.time);

                if (correctPlayers.length === 0) return interaction.followUp('⏰ Nobody got it right! The answer was ' + fffQ.correct_opt);

                const winner = correctPlayers[0];
                const leaderboard = correctPlayers.map((p, idx) => `${idx === 0 ? '🥇' : '👤'} **${p.user.username}** - ${p.time.toFixed(2)}s`).join('\n');

                await interaction.followUp({ 
                    embeds: [new EmbedBuilder().setTitle('🎉 WINNER!').setDescription(`${leaderboard}\n\n<@${winner.user.id}>, welcome to the Hot Seat!`).setColor('#2ecc71')] 
                });

                setTimeout(() => startMainGame(interaction, winner.user), 3000);
            });

        } catch (err) {
            console.error(err);
            interaction.editReply('❌ Database Error.');
        }
    }
};

async function startMainGame(interaction, player) {
    let level = 1;
    let winnings = 0;
    let lifelines = { fifty: true, poll: true, swap: true };
    let active = true;

    while (active && level <= 10) {
        const [qRows] = await db.query("SELECT * FROM kbc_questions WHERE type = 'MAIN' AND difficulty = ? ORDER BY RAND() LIMIT 1", [level]);
        let qData = qRows[0];
        if (!qData) break;

        let currentQuestionActive = true;
        let disabledButtons = [];
        let pollText = "";

        while (currentQuestionActive) {
            const prize = PRIZE_LADDER[level - 1];
            const embed = new EmbedBuilder()
                .setTitle(`Question ${level} • ₹${prize.toLocaleString()}`)
                .setDescription(`**${qData.question}**\n\n**A)** ${disabledButtons.includes('A') ? '---' : qData.opt_a}\n**B)** ${disabledButtons.includes('B') ? '---' : qData.opt_b}\n**C)** ${disabledButtons.includes('C') ? '---' : qData.opt_c}\n**D)** ${disabledButtons.includes('D') ? '---' : qData.opt_d}\n\n${pollText}`)
                .setColor('#3498db')
                .setFooter({ text: `Current Bank: ₹${winnings.toLocaleString()} | Player: ${player.username}` });

            const btns = new ActionRowBuilder().addComponents(
                ['A', 'B', 'C', 'D'].map(opt => new ButtonBuilder().setCustomId(`opt_${opt}`).setLabel(opt).setStyle(ButtonStyle.Primary).setDisabled(disabledButtons.includes(opt))),
                new ButtonBuilder().setCustomId('quit').setLabel('Quit').setStyle(ButtonStyle.Danger)
            );

            const lls = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ll_fifty').setLabel('50:50').setStyle(ButtonStyle.Success).setDisabled(!lifelines.fifty),
                new ButtonBuilder().setCustomId('ll_poll').setLabel('Poll').setStyle(ButtonStyle.Success).setDisabled(!lifelines.poll),
                new ButtonBuilder().setCustomId('ll_swap').setLabel('Swap').setStyle(ButtonStyle.Success).setDisabled(!lifelines.swap)
            );

            const msg = await interaction.channel.send({ content: `<@${player.id}>`, embeds: [embed], components: [btns, lls] });

            try {
                const i = await msg.awaitMessageComponent({ filter: rx => rx.user.id === player.id, time: 60000 });
                await i.deferUpdate();
                await msg.delete().catch(() => {});

                if (i.customId === 'quit') {
                    active = false; currentQuestionActive = false;
                    await giveMoney(player.id, winnings);
                    return interaction.channel.send(`🚶 <@${player.id}> quit with **₹${winnings.toLocaleString()}**!`);
                }

                if (i.customId === 'll_fifty') {
                    lifelines.fifty = false;
                    const wrong = ['A', 'B', 'C', 'D'].filter(o => o !== qData.correct_opt).sort(() => 0.5 - Math.random()).slice(0, 2);
                    disabledButtons.push(...wrong);
                    continue; // Re-renders the same question
                }

                if (i.customId === 'll_poll') {
                    lifelines.poll = false;
                    let p = { A: 5, B: 5, C: 5, D: 5 };
                    p[qData.correct_opt] = 70 + Math.floor(Math.random() * 15);
                    pollText = `📊 **Audience:** A:${p.A}% | B:${p.B}% | C:${p.C}% | D:${p.D}%`;
                    continue;
                }

                if (i.customId === 'll_swap') {
                    lifelines.swap = false;
                    currentQuestionActive = false; // Breaks inner loop to fetch new qData
                    continue;
                }

                const pick = i.customId.split('_')[1];
                if (pick === qData.correct_opt) {
                    winnings = prize;
                    level++;
                    currentQuestionActive = false;
                    await interaction.channel.send(`✅ **Correct!** Next level coming up...`);
                } else {
                    active = false; currentQuestionActive = false;
                    let fallback = level > 5 ? PRIZE_LADDER[4] : 0;
                    await giveMoney(player.id, fallback);
                    return interaction.channel.send(`❌ **Wrong!** The answer was **${qData.correct_opt}**. You take home **₹${fallback.toLocaleString()}**.`);
                }
            } catch (e) {
                active = false; currentQuestionActive = false;
                await giveMoney(player.id, winnings);
                return interaction.channel.send(`⏰ Time up! You won **₹${winnings.toLocaleString()}**.`);
            }
        }
    }
    if (level > 10) {
        await giveMoney(player.id, PRIZE_LADDER[9]);
        interaction.channel.send(`🏆 **CROREPATI!** <@${player.id}> won ₹5,000,000!`);
    }
}

async function giveMoney(discordId, amount) {
    if (amount <= 0) return;
    try {
        await db.query(`UPDATE economy e JOIN users u ON e.user_id = u.id SET e.balance = e.balance + ? WHERE u.discord_id = ?`, [amount, discordId]);
    } catch(e) { console.error(e); }
}
