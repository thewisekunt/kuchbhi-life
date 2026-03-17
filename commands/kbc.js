async function startMainGame(interaction, player) {
    let level = 1;
    let winnings = 0;
    let lifelines = { fifty: true, poll: true, swap: true };
    let active = true;

    // Use a variable to track the message so we can edit it
    let kbcMessage = null;

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
                .setTitle(`💰 Question ${level} • ₹${prize.toLocaleString()}`)
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

            // --- CRITICAL FIX HERE ---
            // We use editReply to keep the interaction alive and REMOVE "thinking..."
            kbcMessage = await interaction.editReply({ 
                content: `<@${player.id}>, here is your next question!`, 
                embeds: [embed], 
                components: [btns, lls] 
            });

            try {
                const i = await kbcMessage.awaitMessageComponent({ filter: rx => rx.user.id === player.id, time: 60000 });
                
                // Acknowledge the button immediately so the BUTTON doesn't spin
                await i.deferUpdate();

                if (i.customId === 'quit') {
                    active = false; currentQuestionActive = false;
                    await giveMoney(player.id, winnings);
                    return await interaction.editReply({ content: `🚶 <@${player.id}> quit with **₹${winnings.toLocaleString()}**!`, embeds: [], components: [] });
                }

                if (i.customId === 'll_fifty') {
                    lifelines.fifty = false;
                    const wrong = ['A', 'B', 'C', 'D'].filter(o => o !== qData.correct_opt).sort(() => 0.5 - Math.random()).slice(0, 2);
                    disabledButtons.push(...wrong);
                    continue; 
                }

                if (i.customId === 'll_poll') {
                    lifelines.poll = false;
                    let p = { A: 5, B: 5, C: 5, D: 5 };
                    p[qData.correct_opt] = 70 + Math.floor(Math.random() * 15);
                    pollText = `📊 **Audience Poll:** A:${p.A}% | B:${p.B}% | C:${p.C}% | D:${p.D}%`;
                    continue;
                }

                if (i.customId === 'll_swap') {
                    lifelines.swap = false;
                    currentQuestionActive = false; 
                    continue;
                }

                const pick = i.customId.split('_')[1];
                if (pick === qData.correct_opt) {
                    winnings = prize;
                    level++;
                    currentQuestionActive = false;
                    // Briefly show "Correct" before next level
                    await interaction.editReply({ content: `✅ **Sahi Jawab!** (Correct!) Loading next question...`, components: [] });
                    await new Promise(r => setTimeout(r, 2000));
                } else {
                    active = false; currentQuestionActive = false;
                    let fallback = level > 5 ? PRIZE_LADDER[4] : 0;
                    await giveMoney(player.id, fallback);
                    return await interaction.editReply({ content: `❌ **Galat Jawab.** The answer was **${qData.correct_opt}**. You won **₹${fallback.toLocaleString()}**.`, embeds: [], components: [] });
                }
            } catch (e) {
                active = false; currentQuestionActive = false;
                await giveMoney(player.id, winnings);
                return await interaction.editReply({ content: `⏰ Time's up! You leave with **₹${winnings.toLocaleString()}**.`, embeds: [], components: [] });
            }
        }
    }
}
