const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../db');
const ensureUser = require('../utils/ensureUser');

// --- CARD ENGINE HELPER FUNCTIONS ---
const suits = ['♠️', '♥️', '♦️', '♣️'];
const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck() {
    let deck = [];
    for (let suit of suits) {
        for (let value of values) {
            deck.push({ suit, value });
        }
    }
    return deck.sort(() => Math.random() - 0.5); // Simple shuffle
}

function calcScore(hand) {
    let score = 0;
    let aces = 0;
    for (const card of hand) {
        if (['J', 'Q', 'K'].includes(card.value)) score += 10;
        else if (card.value === 'A') { score += 11; aces += 1; }
        else score += parseInt(card.value);
    }
    // Handle Aces being 1 or 11
    while (score > 21 && aces > 0) {
        score -= 10;
        aces -= 1;
    }
    return score;
}

function formatHand(hand, hideSecond = false) {
    if (hideSecond && hand.length >= 2) {
        return `\`${hand[0].value}${hand[0].suit}\` | \`❓\``;
    }
    return hand.map(c => `\`${c.value}${c.suit}\``).join(' | ');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('🃏 Play a game of Blackjack and bet your economy balance!')
        .addIntegerOption(option => 
            option.setName('bet')
                .setDescription('How much do you want to bet?')
                .setRequired(true)
                .setMinValue(1)
        ),

    async execute(interaction) {
        // FOOLPROOF DEFER FIX: No double-defer crashes here!
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply().catch(() => {});
        }

        const bet = interaction.options.getInteger('bet');
        const user = interaction.user;

        try {
            await ensureUser(user);

            // 1. Check user balance
            const [[ecoData]] = await db.execute(`
                SELECT e.balance 
                FROM economy e 
                JOIN users u ON e.user_id = u.id 
                WHERE u.discord_id = ?
            `, [user.id]);

            const balance = ecoData ? ecoData.balance : 0;

            if (balance < bet) {
                return interaction.editReply(`❌ You don't have enough money! Your current balance is **₹${balance.toLocaleString()}**.`);
            }

            // 2. Deduct the bet immediately to prevent exploit spam
            await db.execute(`
                UPDATE economy e 
                JOIN users u ON e.user_id = u.id 
                SET e.balance = e.balance - ? 
                WHERE u.discord_id = ?
            `, [bet, user.id]);

            // 3. Initialize the Game
            let deck = createDeck();
            let playerHand = [deck.pop(), deck.pop()];
            let dealerHand = [deck.pop(), deck.pop()];

            let playerScore = calcScore(playerHand);
            let dealerScore = calcScore(dealerHand);

            // Function to update the embed visually
            const buildEmbed = (state = 'playing') => {
                let color = '#3498db'; // Default Blue
                let title = '🃏 Blackjack';
                let statusText = `**Bet:** ₹${bet.toLocaleString()}`;

                if (state === 'win') { color = '#2ecc71'; title = '🎉 You Won!'; }
                else if (state === 'lose') { color = '#e74c3c'; title = '💀 You Lost!'; }
                else if (state === 'tie') { color = '#f1c40f'; title = '🤝 Push (Tie)!'; }
                else if (state === 'blackjack') { color = '#ffd700'; title = '🌟 BLACKJACK!'; }

                const embed = new EmbedBuilder()
                    .setTitle(title)
                    .setColor(color)
                    .setDescription(statusText)
                    .addFields(
                        { 
                            name: `🤵 Dealer's Hand (${state === 'playing' ? '?' : dealerScore})`, 
                            value: formatHand(dealerHand, state === 'playing') 
                        },
                        { 
                            name: `👤 Your Hand (${playerScore})`, 
                            value: formatHand(playerHand) 
                        }
                    )
                    .setFooter({ text: `Player: ${user.username}`, iconURL: user.displayAvatarURL() });

                return embed;
            };

            // 4. Check for instant Blackjack
            if (playerScore === 21) {
                const payout = Math.floor(bet * 2.5); // 3:2 payout for Blackjack + original bet
                await db.execute(`UPDATE economy e JOIN users u ON e.user_id = u.id SET e.balance = e.balance + ? WHERE u.discord_id = ?`, [payout, user.id]);
                return interaction.editReply({ content: `**BLACKJACK!** You won **₹${(payout - bet).toLocaleString()}**!`, embeds: [buildEmbed('blackjack')] });
            }

            // 5. Build Interactive Buttons
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('hit').setLabel('Hit 🃏').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('stand').setLabel('Stand 🛑').setStyle(ButtonStyle.Danger)
            );

            const msg = await interaction.editReply({ embeds: [buildEmbed()], components: [row], fetchReply: true });

            // 6. Collector Logic
            const filter = i => i.user.id === user.id;
            const collector = msg.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async i => {
                if (i.customId === 'hit') {
                    playerHand.push(deck.pop());
                    playerScore = calcScore(playerHand);

                    if (playerScore > 21) {
                        collector.stop('bust');
                        await i.update({ content: `**BUST!** You went over 21 and lost **₹${bet.toLocaleString()}**.`, embeds: [buildEmbed('lose')], components: [] });
                    } else {
                        await i.update({ embeds: [buildEmbed('playing')], components: [row] });
                    }
                } 
                else if (i.customId === 'stand') {
                    collector.stop('stand');

                    // Dealer Logic: Hit until 17
                    while (dealerScore < 17) {
                        dealerHand.push(deck.pop());
                        dealerScore = calcScore(dealerHand);
                    }

                    // Determine Winner
                    let resultState = '';
                    let resultMsg = '';
                    let payout = 0;

                    if (dealerScore > 21 || playerScore > dealerScore) {
                        resultState = 'win';
                        payout = bet * 2; // Return bet + 1x profit
                        resultMsg = `**YOU WIN!** The dealer busted or you had a higher score. You won **₹${bet.toLocaleString()}**!`;
                    } else if (dealerScore > playerScore) {
                        resultState = 'lose';
                        resultMsg = `**YOU LOSE!** The dealer had a better hand. You lost **₹${bet.toLocaleString()}**.`;
                    } else {
                        resultState = 'tie';
                        payout = bet; // Return the exact bet back
                        resultMsg = `**PUSH!** It's a tie. Your **₹${bet.toLocaleString()}** has been returned.`;
                    }

                    // Payout the player if they won or tied
                    if (payout > 0) {
                        await db.execute(`UPDATE economy e JOIN users u ON e.user_id = u.id SET e.balance = e.balance + ? WHERE u.discord_id = ?`, [payout, user.id]);
                    }

                    await i.update({ content: resultMsg, embeds: [buildEmbed(resultState)], components: [] });
                }
            });

            collector.on('end', async (collected, reason) => {
                if (reason === 'time') {
                    // Player took too long, fold their hand automatically
                    await interaction.editReply({ content: `⏰ You took too long to respond! The dealer took your **₹${bet.toLocaleString()}**.`, embeds: [buildEmbed('lose')], components: [] });
                }
            });

        } catch (error) {
            console.error('Blackjack Error:', error);
            await interaction.editReply({ content: '❌ A casino error occurred while processing your bet.', components: [] });
        }
    }
};
