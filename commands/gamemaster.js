const { 
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');
const db = require('../db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gamemaster')
        .setDescription('Open game master panel to manage automated Among Us game'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🎮 Game Master Panel')
            .setDescription('Manage the Imposter game automation from here.');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('open_questions_modal').setLabel('Setup & Start Game').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('end_game').setLabel('Reset Roles').setStyle(ButtonStyle.Danger)
        );

        return interaction.editReply({ embeds: [embed], components: [row] });
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

        // 1. Create Game Thread
        const thread = await interaction.channel.threads.create({
            name: `🎮 Game - ${new Date().toLocaleTimeString()}`,
            autoArchiveDuration: 60,
            reason: 'Automated Among Us Game',
        });

        // 2. Add players and Setup
        for (const m of membersWithRole) { await thread.members.add(m.id); }
        
        await thread.send(`🎮 **Game Started!**\n<@&${imposRole.id}> Check DMs for your questions. You have **90 seconds** to answer here!`);

        // 3. Send DMs
        for (const member of membersWithRole) {
            const isImposter = member.id === randomImposter.id;
            const dmEmbed = new EmbedBuilder()
                .setTitle('🕵️ Your Secret Question')
                .setDescription(isImposter ? imposterQuestion : generalQuestion)
                .setColor(isImposter ? '#FF0000' : '#00FF00');
            
            await member.send({ embeds: [dmEmbed] }).catch(() => thread.send(`⚠️ Couldn't DM <@${member.id}>!`));
        }

        await interaction.editReply(`✅ Game started in <#${thread.id}>`);

        // 4. Automation: Discussion (90s) -> Start Voting
        setTimeout(() => this.startVoting(thread, membersWithRole, randomImposter.id), 90000);
    },

    async startVoting(thread, players, imposterId) {
        // Kick Inactives (Check if users sent a message in thread)
        const messages = await thread.messages.fetch({ limit: 100 });
        const activeIds = messages.map(m => m.author.id);
        const survivors = [];

        for (const p of players) {
            if (!activeIds.includes(p.id)) {
                await p.roles.remove(p.guild.roles.cache.find(r => r.name === 'impos')).catch(() => {});
                await thread.send(`👢 <@${p.id}> was kicked for inactivity.`);
            } else {
                survivors.push(p);
            }
        }

        const voteEmbed = new EmbedBuilder()
            .setTitle('🗳️ Voting Time!')
            .setDescription('Who is the imposter? React to vote!\n' + 
                survivors.map((p, i) => `${i + 1}️⃣ - ${p.user.username}`).join('\n'))
            .setColor('#FFA500');

        const pollMsg = await thread.send({ content: '🚨 **TIME IS UP!** Cast your votes. (45 Seconds)', embeds: [voteEmbed] });
        const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];
        for (let i = 0; i < survivors.length; i++) { await pollMsg.react(emojis[i]); }

        setTimeout(() => this.resolveGame(thread, pollMsg, survivors, imposterId), 45000);
    },

    async resolveGame(thread, pollMsg, survivors, imposterId) {
        const poll = await pollMsg.fetch();
        let mostVotedIndex = 0, maxVotes = -1;
        const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];

        for (let i = 0; i < survivors.length; i++) {
            const count = (poll.reactions.cache.get(emojis[i])?.count || 1) - 1;
            if (count > maxVotes) { maxVotes = count; mostVotedIndex = i; }
        }

        const voted = survivors[mostVotedIndex];
        const isWin = voted.id === imposterId;

        await thread.send({
            embeds: [new EmbedBuilder()
                .setTitle(isWin ? '🎉 Crew Won!' : '💀 Imposter Won!')
                .setDescription(`The imposter was <@${imposterId}>!`)
                .setColor(isWin ? '#00FF00' : '#FF0000')]
        });

        // Update Leaderboard
        for (const s of survivors) {
            const win = (isWin && s.id !== imposterId) || (!isWin && s.id === imposterId);
            await db.query(`
                INSERT INTO imposter_leaderboard (user_id, games_won, games_played, imposter_wins)
                VALUES ((SELECT id FROM users WHERE discord_id = ?), ?, 1, ?)
                ON DUPLICATE KEY UPDATE games_won = games_won + VALUES(games_won), games_played = games_played + 1, imposter_wins = imposter_wins + VALUES(imposter_wins)
            `, [s.id, win ? 1 : 0, (s.id === imposterId && !isWin) ? 1 : 0]);
            await s.roles.remove(s.guild.roles.cache.find(r => r.name === 'impos')).catch(() => {});
        }
    }
};
