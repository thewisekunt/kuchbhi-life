const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const db = require('../db');

const PRIZE_LADDER = [100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000, 5000000];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kbc')
        .setDescription('🧠 Start a game of Kuch Bhi Crorepati!')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply().catch(() => {});
        }

        try {
            // PHASE 1: FASTEST FINGER FIRST
            const [fffRows] = await db.query("SELECT * FROM kbc_questions WHERE type = 'FFF' ORDER BY RAND() LIMIT 1");
            const fffQ = fffRows[0];
            if (!fffQ) return interaction.editReply('❌ No FFF questions found!');

            const fffEmbed = new EmbedBuilder()
                .setTitle('⏱️ FASTEST FINGER FIRST!')
                .setDescription(`**${fffQ.question}**\n\n**A)** ${fffQ.opt_a}\n**B)** ${fffQ.opt_b}\n**C)** ${fffQ.opt_c}\n**D)** ${fffQ.opt_d}\n\n*15 seconds start now!*`)
                .setColor('#e74c3c');

            const fffRow = new ActionRowBuilder().addComponents(
                ['A', 'B', 'C', 'D'].map(id => new ButtonBuilder().setCustomId(id).setLabel(id).setStyle(ButtonStyle.Primary))
            );

            const fffMsg = await interaction.editReply({ embeds: [fffEmbed], components: [fffRow], fetchReply: true });

            const clicks = new Map();
            const startTime = Date.now();
            const collector = fffMsg.createMessageComponentCollector({ time: 15000 });

            collector.on('collect', async i => {
                if (clicks.has(i.user.id)) return i.reply({ content: 'Already answered!', flags: 64 });
                clicks.set(i.user.id, { 
                    answer: i.customId, 
                    time: (Date.now() - startTime) / 1000, 
                    user: i.user 
                });
                await i.reply({ content: `Locked in **${i.customId}**!`, flags: 64 });
            });

            collector.on('end', async () => {
                const correctPlayers = Array.from(clicks.values())
                    .filter(p => p.answer === fffQ.correct_opt)
                    .sort((a, b) => a.time - b.time);

                if (correctPlayers.length === 0) return interaction.followUp(`⏰ Time up! No one got it. It was **${fffQ.correct_opt}**.`);

                const winner = correctPlayers[0];
                const leaderboard = correctPlayers.slice(0, 5).map((p, i) => `${i === 0 ? '🥇' : '👤'} **${p.user.username}** — ${p.time.toFixed(2)}s`).join('\n');

                await interaction.followUp({ 
                    embeds: [new EmbedBuilder().setTitle('🎉 WINNER!').setDescription(`${leaderboard}\n\n<@${winner.user.id}> moves to the Hot Seat!`).setColor('#2ecc71')] 
                });

                setTimeout(() => startMainGame(interaction, winner.user), 5000);
            });
        } catch (err) {
            console.error(err);
            interaction.editReply('❌ Database error.');
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
    if (!qData) return interaction.channel.send(`⚠️ Level ${level} missing. Game over! You win ₹${winnings}.`);

    const prize = PRIZE_LADDER[level - 1];
    let disabledOpts = [];
    let pollText = "";

    const generateComponents = () => {
        const row1 = new ActionRowBuilder().addComponents(
            ['A', 'B', 'C', 'D'].map(opt => new ButtonBuilder()
                .setCustomId(`opt_${opt}`)
                .setLabel(disabledOpts.includes(opt) ? '---' : opt)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disabledOpts.includes(opt))),
            new ButtonBuilder().setCustomId('quit').setLabel('Quit').setStyle(ButtonStyle.Danger)
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ll_fifty').setLabel('50:50').setStyle(ButtonStyle.Success).setDisabled(!lifelines.fifty),
            new ButtonBuilder().setCustomId('ll_poll').setLabel('Poll').setStyle(ButtonStyle.Success).setDisabled(!lifelines.poll),
            new ButtonBuilder().setCustomId('ll_swap').setLabel('Swap').setStyle(ButtonStyle.Success).setDisabled(!lifelines.swap)
        );
        return [row1, row2];
    };

    const embed = new EmbedBuilder()
        .setTitle(`Question ${level} • ₹${prize.toLocaleString()}`)
        .setDescription(`**${qData.question}**\n\n**A)** ${qData.opt_a}\n**B)** ${qData.opt_b}\n**C)** ${qData.opt_c}\n**D)** ${qData.opt_d}`)
        .setColor('#3498db')
        .setFooter({ text: `Bank: ₹${winnings.toLocaleString()} | Player: ${player.username}` });

    const msg = await interaction.channel.send({ 
        content: `<@${player.id}>, your 60s starts now!`, 
        embeds: [embed], 
        components: generateComponents() 
    });

    const collector = msg.createMessageComponentCollector({ filter: i => i.user.id === player.id, time: 60000 });

    collector.on('collect', async i => {
        if (i.customId === 'quit') {
            collector.stop('quit');
            await giveMoney(player.id, winnings);
            return i.update({ content: `🚶 Quit! Won **₹${winnings.toLocaleString()}**`, embeds: [], components: [] });
        }

        if (i.customId.startsWith('ll_')) {
            if (i.customId === 'll_fifty') {
                lifelines.fifty = false;
                disabledOpts = ['A', 'B', 'C', 'D'].filter(o => o !== qData.correct_opt).sort(() => 0.5 - Math.random()).slice(0, 2);
            } else if (i.customId === 'll_poll') {
                lifelines.poll = false;
                pollText = `\n\n📊 **Audience:** ${qData.correct_opt} (78%), Others (22%)`;
            } else if (i.customId === 'll_swap') {
                lifelines.swap = false;
                collector.stop('swap');
                await i.update({ content: '🔄 Swapping...', components: [] });
                return playLevel(interaction, player, level, winnings, lifelines);
            }
            return i.update({ embeds: [EmbedBuilder.from(embed).setDescription(embed.data.description + pollText)], components: generateComponents() });
        }

        const pick = i.customId.split('_')[1];
        collector.stop('answered');
        if (pick === qData.correct_opt) {
            await i.update({ content: `✅ **Correct!**`, components: [] });
            if (level === 10) {
                await giveMoney(player.id, prize);
                return interaction.channel.send(`🎉 **CROREPATI!** <@${player.id}> wins ₹5,000,000!`);
            }
            setTimeout(() => playLevel(interaction, player, level + 1, prize, lifelines), 3000);
        } else {
            let fallback = level > 5 ? PRIZE_LADDER[4] : 0;
            await giveMoney(player.id, fallback);
            return i.update({ content: `❌ **Wrong!** It was **${qData.correct_opt}**. You take **₹${fallback.toLocaleString()}**`, embeds: [], components: [] });
        }
    });

    collector.on('end', (_, reason) => {
        if (reason === 'time') {
            msg.edit({ components: [] }).catch(() => {});
            giveMoney(player.id, winnings);
            interaction.channel.send(`⏰ Time's up <@${player.id}>! You keep **₹${winnings.toLocaleString()}**.`);
        }
    });
}

async function giveMoney(discordId, amount) {
    if (amount <= 0) return;
    try {
        await db.execute(`UPDATE economy e JOIN users u ON e.user_id = u.id SET e.balance = e.balance + ? WHERE u.discord_id = ?`, [amount, discordId]);
    } catch (e) { console.error(e); }
}
