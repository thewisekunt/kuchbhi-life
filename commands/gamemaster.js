const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle 
} = require('discord.js');
const db = require('../db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gamemaster')
        .setDescription('Open game master panel to manage the automated Imposter game'),

    async execute(interaction) {
        // Index.js already defers this command as private/ephemeral
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🎮 Game Master Panel')
            .setDescription('Manage the Imposter game automation from here.');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('open_questions_modal')
                .setLabel('Setup Questions & Start')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('end_game')
                .setLabel('Force Reset Roles')
                .setStyle(ButtonStyle.Danger)
        );

        return interaction.editReply({
            embeds: [embed],
            components: [row],
        });
    },

    async handleButtonClick(interaction) {
        if (interaction.customId === 'open_questions_modal') {
            const modal = new ModalBuilder()
                .setCustomId('game_questions_modal')
                .setTitle('Game Setup');

            const generalQuestion = new TextInputBuilder()
                .setCustomId('general_question')
                .setLabel('General Question (Crew)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Question for the innocent crewmates')
                .setRequired(true);

            const imposterQuestion = new TextInputBuilder()
                .setCustomId('imposter_question')
                .setLabel('Imposter Question')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Question for the hidden imposter')
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(generalQuestion),
                new ActionRowBuilder().addComponents(imposterQuestion)
            );
            
            await interaction.showModal(modal);

        } else if (interaction.customId === 'end_game') {
            const imposRole = interaction.guild.roles.cache.find(r => r.name === 'impos');
            if (!imposRole) return interaction.reply({ content: '❌ Role "impos" not found.', ephemeral: true });

            const members = Array.from(imposRole.members.values());
            for (const member of members) {
                await member.roles.remove(imposRole).catch(() => {});
            }

            await interaction.reply({ 
                content: `✅ Force cleaned roles for ${members.length} players.`, 
                ephemeral: true 
            });
        }
    },

    async handleModalSubmit(interaction) {
        const generalQuestion = interaction.fields.getTextInputValue('general_question');
        const imposterQuestion = interaction.fields.getTextInputValue('imposter_question');

        await interaction.deferReply({ ephemeral: true });

        const imposRole = interaction.guild.roles.cache.find(r => r.name === 'impos');
        if (!imposRole || imposRole.members.size < 3) {
            return interaction.editReply("❌ Need at least 3 players with the 'impos' role to start.");
        }

        const membersWithRole = Array.from(imposRole.members.values());
        const randomImposter = membersWithRole[Math.floor(Math.random() * membersWithRole.length)];

        // 1. Create the Thread
        const thread = await interaction.channel.threads.create({
            name: `🎮 Game - ${new Date().toLocaleTimeString()}`,
            autoArchiveDuration: 60,
            reason: 'Automated Imposter Game',
        });

        // 2. Add players and Setup
        for (const m of membersWithRole) { await thread.members.add(m.id); }
        
        const startEmbed = new EmbedBuilder()
            .setTitle('🎮 Game Started!')
            .setDescription(`Questions have been DM'd. You have **90 seconds** to discuss in this thread.\n\n**Players:**\n${membersWithRole.map(m => `• ${m.user.username}`).join('\n')}`)
            .setColor('#00FF00');

        await thread.send({ content: `<@&${imposRole.id}>`, embeds: [startEmbed] });

        // 3. Send DMs
        for (const member of membersWithRole) {
            const isImposter = member.id === randomImposter.id;
            const dmEmbed = new EmbedBuilder()
                .setTitle('🕵️ Your Secret Question')
                .setDescription(isImposter ? imposterQuestion : generalQuestion)
                .setFooter({ text: 'Answer in the game thread!' })
                .setColor(isImposter ? '#FF0000' : '#00FF00');
            
            await member.send({ embeds: [dmEmbed] }).catch(() => thread.send(`⚠️ Couldn't DM <@${member.id}>! Make sure DMs are open.`));
        }

        // 4. DB Logging (Optional state tracking)
        await db.query("INSERT INTO imposter_games (thread_id, imposter_id, general_question, imposter_question) VALUES (?, ?, ?, ?)", 
            [thread.id, randomImposter.id, generalQuestion, imposterQuestion]).catch(e => console.error(e));

        await interaction.editReply(`✅ Game started in <#${thread.id}>`);

        // 5. Automation: Discussion Phase (90s) -> Start Voting
        setTimeout(() => this.startVoting(thread, membersWithRole, randomImposter.id), 90000);
    },

    async startVoting(thread, players, imposterId) {
        // Kick Inactives (Optional: checks if users sent at least 1 message in thread)
        const messages = await thread.messages.fetch({ limit: 100 });
        const activeIds = messages.map(m => m.author.id);
        
        const validPlayers = [];
        const imposRole = thread.guild.roles.cache.find(r => r.name === 'impos');

        for (const p of players) {
            if (!activeIds.includes(p.id)) {
                await p.roles.remove(imposRole).catch(() => {});
                await thread.send(`👢 <@${p.id}> was kicked for inactivity.`);
            } else {
                validPlayers.push(p);
            }
        }

        if (validPlayers.length < 2) {
            return thread.send("❌ Game cancelled: Not enough active players remained.");
        }

        const voteEmbed = new EmbedBuilder()
            .setTitle('🗳️ Voting Time!')
            .setDescription('Who is the imposter? React with the corresponding number!\n' + 
                validPlayers.map((p, i) => `${i + 1}️⃣ - ${p.user.username}`).join('\n'))
            .setColor('#FFA500')
            .setFooter({ text: 'Voting closes in 45 seconds' });

        const pollMsg = await thread.send({ content: '🚨 **DISCUSSION ENDED!** Cast your votes now.', embeds: [voteEmbed] });
        
        const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        for (let i = 0; i < validPlayers.length; i++) { 
            if (emojis[i]) await pollMsg.react(emojis[i]); 
        }

        // Automation: Voting Phase (45s) -> Resolve Game
        setTimeout(() => this.resolveGame(thread, pollMsg, validPlayers, imposterId), 45000);
    },

    async resolveGame(thread, pollMsg, players, imposterId) {
        const poll = await pollMsg.fetch();
        const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        
        let winnerIndex = -1;
        let maxVotes = -1;

        // Calculate votes
        for (let i = 0; i < players.length; i++) {
            const reaction = poll.reactions.cache.get(emojis[i]);
            const count = (reaction ? reaction.count : 1) - 1; // Exclude bot reaction
            if (count > maxVotes) {
                maxVotes = count;
                winnerIndex = i;
            }
        }

        const votedUser = players[winnerIndex];
        const isCrewWin = votedUser.id === imposterId;
        const imposRole = thread.guild.roles.cache.find(r => r.name === 'impos');

        const resultEmbed = new EmbedBuilder()
            .setTitle(isCrewWin ? '🎉 Crewmates Won!' : '💀 Imposter Won!')
            .setDescription(`The imposter was <@${imposterId}>.\n\nThe group voted for **${votedUser.user.username}** with ${maxVotes} votes.`)
            .setColor(isCrewWin ? '#00FF00' : '#FF0000')
            .setTimestamp();

        await thread.send({ embeds: [resultEmbed] });

        // Update Database Leaderboard
        for (const p of players) {
            const didWin = (isCrewWin && p.id !== imposterId) || (!isCrewWin && p.id === imposterId);
            const isImposter = p.id === imposterId;

            await db.query(`
                INSERT INTO imposter_leaderboard (user_id, games_won, games_played, imposter_wins)
                VALUES ((SELECT id FROM users WHERE discord_id = ?), ?, 1, ?)
                ON DUPLICATE KEY UPDATE 
                    games_won = games_won + VALUES(games_won),
                    games_played = games_played + 1,
                    imposter_wins = imposter_wins + VALUES(imposter_wins)
            `, [p.id, didWin ? 1 : 0, (isImposter && !isCrewWin) ? 1 : 0]).catch(e => console.error(e));

            // Clean up role
            await p.roles.remove(imposRole).catch(() => {});
        }

        await thread.send("✅ Game finished. Roles cleared. This thread will now archive.");
        await thread.setArchived(true);
    }
};
