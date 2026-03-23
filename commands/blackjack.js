const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const db = require('../db');
const ensureUser = require('../utils/ensureUser');

// --- CUSTOM EMOJI ENGINE ---
// Paste your custom emoji codes here once you upload them to your server!
// Example: '♠️_A': '<:spade_a:123456789012345678>'
const customCards = {
    '♠️_A': '<:SA:1485593113060839494>', '♠️_2': '<:S2:1485593086384935043>', '♠️_3': '<:S3:1485593088431882252>', '♠️_4': '<:S4:1485593090474508349>', '♠️_5': '<:S5:1485593092450156756>', '♠️_6': '<:S6:1485593094421221416>', '♠️_7': '<:S7:1485593096308785273>', '♠️_8': '<:S8:1485593098846339162>', '♠️_9': '<:S9:1485593100838768810>', '♠️_10': '<:S10:1485593104441675827>', '♠️_J': '<:SJ:1485593106995871775>', '♠️_Q': '<:SQ:1485593109038497934>', '♠️_K': '<:SK:1485593111303295017>',
    '♥️_A': '<:HA:1485594346253451265>', '♥️_2': '<:H2:1485594317304107021>', '♥️_3': '<:H3:1485594319535738950>', '♥️_4': '<:H4:1485594321641148537>', '♥️_5': '<:H5:1485594323893354567>', '♥️_6': '<:H6:1485594325973991544>', '♥️_7': '<:H7:1485594328226074704>', '♥️_8': '<:H8:1485594331145568386>', '♥️_9': '<:H9:1485594333456367616>', '♥️_10': '<:H10:1485594335868096582>', '♥️_J': '<:HJ:1485594338061975713>', '♥️_Q': '<:HQ:1485594341463425054>', '♥️_K': '<:HK:1485594343828885594>',
    '♦️_A': '<:DA:1485594904728965170>', '♦️_2': '<:D2:1485594879244632166>', '♦️_3': '<:D3:1485594881358561280>', '♦️_4': '<:D4:1485594883010859009>', '♦️_5': '<:D5:1485594885191897128>', '♦️_6': '<:D6:1485594887192842370>', '♦️_7': '<:D7:1485594889264828497>', '♦️_8': '<:D8:1485594891214917724>', '♦️_9': '<:D9:1485594894037942413>', '♦️_10': '<:D10:1485594896533426217>', '♦️_J': '<:DJ:1485594898173399132>', '♦️_Q': '<:DQ:1485594900669010043>', '♦️_K': '<:DK:1485594902795653223>',
    '♣️_A': '', '♣️_2': '<:C2:1485592394048077955>', '♣️_3': '<:C3:1485592395784392714>', '♣️_4': '<:C4:1485592397873156177>', '♣️_5': '<:C5:1485592399861514412>', '♣️_6': '<:C6:1485592401685778492>', '♣️_7': '<:C7:1485592403552505916>', '♣️_8': '<:C8:1485592405477556244>', '♣️_9': '<:C9:1485592407486496910>', '♣️_10': '<:C10:1485592409394905138>', '♣️_J': '<:CJ:1485592411525873705>', '♣️_Q': '<:CQ:1485592413262315576>', '♣️_K': '<:CK:1485592415350821004>'
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
