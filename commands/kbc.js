const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const db = require('../db');

const PRIZE_LADDER = [100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000, 5000000];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kbc')
        .setDescription('🧠 Start a game of Kuch Bhi Crorepati!')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        // Initial defer to handle the slash command trigger
        await interaction.deferReply().catch(() => {});

        try {
            // PHASE 1: FASTEST FINGER FIRST
            const [fffRows] = await db.query("SELECT * FROM kbc_questions WHERE type = 'FFF' ORDER BY RAND() LIMIT 1");
            const fffQ = fffRows[0];
            if (!fffQ) return interaction.editReply('❌ No FFF questions found in Database!');

            const fffEmbed = new EmbedBuilder()
                .setTitle('⏱️ FASTEST FINGER FIRST!')
                .setDescription(`**${fffQ.question}**\n\n**A)** ${fffQ.opt_a}\n**B)** ${fffQ.opt_b}\n**C)** ${fffQ.opt_c}\n**D)** ${fffQ.opt_d}\n\n*15 seconds to lock in!*`)
                .setColor('#e74c3c');

            const fffRow = new ActionRowBuilder().addComponents(
                ['A', 'B', 'C', 'D'].map(id => new ButtonBuilder().setCustomId(`kbc_fff_${id}`).setLabel(id).setStyle(ButtonStyle.Primary))
            );

            const fffMsg = await interaction.editReply({ embeds: [fffEmbed], components: [fffRow], fetchReply: true });

            const clicks = new Map();
            const startTime = Date.now();
            const collector = fffMsg.createMessageComponentCollector({ time: 15000 });

            collector.on('collect', async i => {
                await i.deferReply({ ephemeral: true }).catch(() => {});
                if (clicks.has(i.user.id)) return i.editReply({ content: 'Answer already locked!' });

                clicks.set(i.user.id, { 
                    answer: i.customId.replace('kbc_fff_', ''), 
                    time: (Date.now() - startTime) / 1000, 
                    user: i.user 
                });
                await i.editReply({ content: `Locked in! Time: ${((Date.now() - startTime) / 1000).toFixed(2)}s` });
            });

            collector.on('end', async () => {
                const correctPlayers = Array.from(clicks.values())
                    .filter(p => p.answer === fffQ.correct_opt)
                    .sort((a, b) => a.time - b.time);

                if (correctPlayers.length === 0) {
                    return interaction.followUp(`⏰ Time up! No one got it. Correct: **${fffQ.correct_opt}**.`);
                }

                const winner = correctPlayers[0];
                const leaderboard = correctPlayers.slice(0, 5).map((p, idx) => `${idx === 0 ? '🥇' : '👤'} **${p.user.username}** — ${p.time.toFixed(2)}s`).join('\n');

                await interaction.followUp({ 
                    embeds: [new EmbedBuilder().setTitle('🎉 WE HAVE A WINNER!').setDescription(`${leaderboard}\n\n<@${winner.user.id}> moves to the Hot Seat!`).setColor('#2ecc71')] 
                });

                setTimeout(() => startMainGame(interaction, winner.user), 4000);
            });
        } catch (err) {
            console.error(err);
            interaction.editReply('❌ Database Error.');
        }
    }
};

async function startMainGame(interaction, player) {
    let currentLevel = 1;
    let winnings = 0;
    let lifelines = { fifty: true, poll: true, swap: true };
    await playLevel(interaction, player, currentLevel, winnings, lifelines);
}

async function playLevel(interaction, player, level, winnings, lifelines) {
    const [qRows] = await db.execute("SELECT * FROM kbc_questions WHERE type = 'MAIN' AND difficulty = ? ORDER BY RAND() LIMIT 1", [level]);
    const qData = qRows[0];
    if (!qData) return interaction.channel.send(`⚠️ Level ${level} missing in DB. Won ₹${winnings}.`);

    const prize = PRIZE_LADDER[level - 1];
    let disabledOpts = [];
    let pollText = "";

    const generateComponents = () => {
        const row1 = new ActionRowBuilder().addComponents(
            ['A', 'B', 'C', 'D'].map(opt => new ButtonBuilder()
                .setCustomId(`kbc_opt_${opt}`)
                .setLabel(disabledOpts.includes(opt) ? '---' : opt)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disabledOpts.includes(opt))),
            new ButtonBuilder().setCustomId('kbc_quit').setLabel('Quit').setStyle(ButtonStyle.Danger)
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('kbc_ll_fifty').setLabel('50:50').setStyle(ButtonStyle.Success).setDisabled(!lifelines.fifty),
            new ButtonBuilder().setCustomId('kbc_ll_poll').setLabel('Poll').setStyle(ButtonStyle.Success).setDisabled(!lifelines.poll),
            new ButtonBuilder().setCustomId('kbc_ll_swap').setLabel('Swap').setStyle(ButtonStyle.Success).setDisabled(!lifelines.swap)
        );
        return [row1, row2];
    };

    const embed = new EmbedBuilder()
        .setTitle(`Question ${level} • ₹${prize.toLocaleString()}`)
        .setDescription(`**${qData.question}**\n\n**A)** ${qData.opt_a}\n**B)** ${qData.opt_b}\n**C)** ${qData.opt_c}\n**D)** ${qData.opt_d}`)
        .setColor('#3498db')
        .setFooter({ text: `Current Bank: ₹${winnings.toLocaleString()} | Player: ${player.username}` });

    const msg = await interaction.channel.send({ 
        content: `<@${player.id}>, 60 seconds on the clock!`, 
        embeds: [embed], 
        components: generateComponents() 
    });

    const collector = msg.createMessageComponentCollector({ 
        filter: i => i.user.id === player.id && i.customId.startsWith('kbc_'), 
        time: 60000 
    });

    collector.on('collect', async i => {
        // ALWAYS deferUpdate immediately to kill the "Unknown Interaction"
        await i.deferUpdate().catch(() => {});

        const action = i.customId.replace('kbc_', '');

        if (action === 'quit') {
            collector.stop('quit');
            await giveMoney(player.id, winnings);
            return i.editReply({ content: `🚶 Quit! You take home **₹${winnings.toLocaleString()}**`, embeds: [], components: [] });
        }

        if (action.startsWith('ll_')) {
            if (action === 'll_fifty') {
                lifelines.fifty = false;
                disabledOpts = ['A', 'B', 'C', 'D'].filter(o => o !== qData.correct_opt).sort(() => 0.5 - Math.random()).slice(0, 2);
            } else if (action === 'll_poll') {
                lifelines.poll = false;
                pollText = `\n\n📊 **Audience:** ${qData.correct_opt} (74%), Others (26%)`;
            } else if (action === 'll_swap') {
                lifelines.swap = false;
                collector.stop('swap');
                return playLevel(interaction, player, level, winnings, lifelines);
            }
            return i.editReply({ embeds: [EmbedBuilder.from(embed).setDescription(embed.data.description + pollText)], components: generateComponents() });
        }

        const pick = action.split('_')[1];
        collector.stop('answered');

        if (pick === qData.correct_opt) {
            await i.editReply({ content: `✅ **CORRECT!**`, components: [], embeds: [] });
            if (level === 10) {
                await giveMoney(player.id, prize);
                return interaction.channel.send(`🎉 **CROREPATI!** <@${player.id}> wins the jackpot of ₹5,000,000!`);
            }
            setTimeout(() => playLevel(interaction, player, level + 1, prize, lifelines), 3000);
        } else {
            let fallback = level > 5 ? PRIZE_LADDER[4] : 0;
            await giveMoney(player.id, fallback);
            return i.editReply({ content: `❌ **WRONG!** It was **${qData.correct_opt}**. You leave with **₹${fallback.toLocaleString()}**`, embeds: [], components: [] });
        }
    });

    collector.on('end', (_, reason) => {
        if (reason === 'time') {
            msg.edit({ content: `⏰ Time is up!`, components: [] }).catch(() => {});
            giveMoney(player.id, winnings);
        }
    });
}

async function giveMoney(discordId, amount) {
    if (amount <= 0) return;
    try {
        await db.execute(`UPDATE economy e JOIN users u ON e.user_id = u.id SET e.balance = e.balance + ? WHERE u.discord_id = ?`, [amount, discordId]);
    } catch (e) { console.error("Money Update Failed:", e); }
}
