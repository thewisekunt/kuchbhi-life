const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../db');
const ensureUser = require('../utils/ensureUser');

// --- CUSTOM EMOJI ENGINE ---
// Paste your custom emoji codes here once you upload them to your server!
// Example: '♠️_A': '<:spade_a:123456789012345678>'
const customCards = {
    '♠️_A': '<:1S:1485947230102884382>', '♠️_2': '<:2S:1485947231948378252>', '♠️_3': '<:3S:1485947233571705014>', '♠️_4': '<:4S:1485947236159324241>', '♠️_5': '<:5S:1485947238285971456>', '♠️_6': '<:6S:1485947240408158228>', '♠️_7': '<:7S:1485947242253648003>', '♠️_8': '<:8S:1485947244367581294>', '♠️_9': '<:9S:1485947246594752672>', '♠️_10': '<:10S:1485947249984012368>', '♠️_J': '<:11S:1485947252768772207>', '♠️_Q': '<:12S:1485947256912875540>', '♠️_K': '<:13S:1485947254987558963>',
    '♥️_A': '<:1H:1485628722848731287>', '♥️_2': '<:2H:1485628724979437608>', '♥️_3': '<:3H:1485628726841704609>', '♥️_4': '<:4H:1485628728917885099>', '♥️_5': '<:5H:1485628731014774894>', '♥️_6': '<:6H:1485628732751347752>', '♥️_7': '<:7H:1485628734760554649>', '♥️_8': '<:8H:1485628737067286712>', '♥️_9': '<:9H:1485628739042807818>', '♥️_10': '<:10H:1485628740967993454>', '♥️_J': '<:11H:1485628742507302954>', '♥️_Q': '<:12H:1485628746496213103>', '♥️_K': '<:13H:1485628744617164940>',
    '♦️_A': '<:1D:1485626923164897370>', '♦️_2': '<:2D:1485626925555781815>', '♦️_3': '<:3D:1485626927455666329>', '♦️_4': '<:4D:1485626929565667368>', '♦️_5': '<:5D:1485626931759153333>', '♦️_6': '<:6D:1485626934015688865>', '♦️_7': '<:7D:1485626936272355409>', '♦️_8': '<:8D:1485626938340016148>', '♦️_9': '<:9D:1485626940390899763>', '♦️_10': '<:10D:1485626942513217596>', '♦️_J': '<:11D:1485626945264685178>', '♦️_Q': '<:12D:1485626949673160824>', '♦️_K': '<:13D:1485626947529609278>',
    '♣️_A': '<:1C:1485948043437150248>', '♣️_2': '<:2C:1485948047035994195>', '♣️_3': '<:3C:1485948052039794718>', '♣️_4': '<:4C:1485948054132756540>', '♣️_5': '<:5C:1485948056276045854>', '♣️_6': '<:6C:1485948058024939551>', '♣️_7': '<:7C:1485948060294058125>', '♣️_8': '<:8C:1485948062261182564>', '♣️_9': '<:9C:1485948064140099665>', '♣️_10': '<:10C:1485948066531115098>', '♣️_J': '<:11C:1485948069412474981>', '♣️_Q': '<:12C:1485948073778741299>', '♣️_K': '<:13C:1485948071627198556>'
};

// --- CARD LOGIC ---
const suits = ['♠️', '♥️', '♦️', '♣️'];
const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck() {
    let deck = [];
    for (let suit of suits) {
        for (let value of values) {
            deck.push({ suit, value });
        }
    }
    return deck.sort(() => Math.random() - 0.5); // Shuffle
}

function calcScore(hand) {
    let score = 0;
    let aces = 0;
    for (const card of hand) {
        if (['J', 'Q', 'K'].includes(card.value)) score += 10;
        else if (card.value === 'A') { score += 11; aces += 1; }
        else score += parseInt(card.value);
    }
    while (score > 21 && aces > 0) {
        score -= 10;
        aces -= 1;
    }
    return score;
}

function getCardDisplay(card) {
    const key = `${card.suit}_${card.value}`;
    // If you pasted a custom emoji ID above, it uses it. Otherwise, it falls back to a clean codeblock!
    return customCards[key] ? customCards[key] : `\`${card.value}${card.suit}\``;
}

function formatHand(hand, hideSecond = false) {
    if (hideSecond && hand.length >= 2) {
        return `${getCardDisplay(hand[0])}  \`❓\``;
    }
    return hand.map(c => getCardDisplay(c)).join('  ');
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
        // FOOLPROOF DEFER FIX FOR SLASH COMMAND
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
                let color = '#3498db'; 
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
                new ButtonBuilder().setCustomId('hit').setLabel('Hit').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('stand').setLabel('Stand').setStyle(ButtonStyle.Danger)
            );

            const msg = await interaction.editReply({ embeds: [buildEmbed()], components: [row], fetchReply: true });

            // 6. Collector Logic
            const filter = i => i.user.id === user.id;
            const collector = msg.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async i => {
                
                // 🔥 ANTI-CRASH FIX: Instantly acknowledge the button click to prevent 10062 Unknown Interaction
                await i.deferUpdate().catch(() => {});

                if (i.customId === 'hit') {
                    playerHand.push(deck.pop());
                    playerScore = calcScore(playerHand);

                    if (playerScore > 21) {
                        collector.stop('bust');
                        // Note: Using interaction.editReply now because we already deferred the button press
                        await interaction.editReply({ content: `**BUST!** You went over 21 and lost **₹${bet.toLocaleString()}**.`, embeds: [buildEmbed('lose')], components: [] });
                    } else {
                        await interaction.editReply({ embeds: [buildEmbed('playing')], components: [row] });
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

                    await interaction.editReply({ content: resultMsg, embeds: [buildEmbed(resultState)], components: [] });
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
