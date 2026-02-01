require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Collection, EmbedBuilder, REST, Routes } = require('discord.js');
const db = require('./db');
const http = require('http');

/* ============================
   0. HEALTH CHECK SERVER
============================ */
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Kuch Bhi Bot is Online!');
}).listen(process.env.PORT || 8000);

/* ============================
   1. CLIENT SETUP
============================ */
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});

// Crash Protection
process.on('unhandledRejection', error => console.error('⚠️ Unhandled Rejection:', error));
process.on('uncaughtException', error => console.error('🚨 Uncaught Exception:', error));

/* ============================
   2. DATA SYNC FUNCTIONS
============================ */
async function syncUserToDB(user) {
    if (!user || user.bot) return;
    const displayName = user.globalName || user.username;

    try {
        await db.execute(`
            INSERT INTO users (discord_id, username, global_name, avatar) 
            VALUES (?, ?, ?, ?) 
            ON DUPLICATE KEY UPDATE 
            username = VALUES(username), 
            global_name = VALUES(global_name),
            avatar = VALUES(avatar)
        `, [user.id, user.username, displayName, user.avatar || 'default']);
    } catch (err) {
        console.error(`[DB] Sync failed for ${user.username}:`, err.message);
    }
}

async function syncAllGuildMembers(guild) {
    if (!guild) return;
    try {
        console.log(`[SYNC] 🔄 Fetching members for: ${guild.name}...`);
        const members = await guild.members.fetch(); 
        console.log(`[SYNC] 📡 Discord returned ${members.size} members.`);

        const allUsersData = [];
        members.forEach(m => {
            if (!m.user.bot) {
                const displayName = m.user.globalName || m.user.username;
                allUsersData.push([m.user.id, m.user.username, displayName, m.user.avatar || 'default']);
            }
        });

        if (allUsersData.length === 0) return console.log("[SYNC] ⚠️ No humans found.");

        const chunkSize = 50;
        console.log(`[SYNC] 💾 Saving ${allUsersData.length} users in batches...`);

        for (let i = 0; i < allUsersData.length; i += chunkSize) {
            const chunk = allUsersData.slice(i, i + chunkSize);
            await db.query(`
                INSERT INTO users (discord_id, username, global_name, avatar) VALUES ? 
                ON DUPLICATE KEY UPDATE username=VALUES(username), global_name=VALUES(global_name), avatar=VALUES(avatar)
            `, [chunk]);
        }
        console.log("[SYNC] 🎉 Full Sync Complete!");
    } catch (err) {
        console.error("[SYNC] ❌ Critical Failure:", err);
    }
}

/* ============================
   3. COMMAND LOADER & DEPLOYER
============================ */
client.commands = new Collection();
const commandsArray = []; // Array needed for REST deployment
const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
        try {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            if (command && 'data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                commandsArray.push(command.data.toJSON()); // Prepare for deploy
            } else {
                console.warn(`[SKIP] ${file} missing data/execute.`);
            }
        } catch (err) {
            console.error(`[ERROR] Failed to load ${file}:`, err.message);
        }
    }
}

/* ============================
   4. INTERACTION HANDLER
============================ */
client.on('interactionCreate', async interaction => {
    syncUserToDB(interaction.user);

    /* SLASH COMMANDS */
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (err) {
            console.error('❌ Command Error:', err);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ An error occurred.', flags: 64 });
            } else if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({ content: '❌ An error occurred.' });
            }
        }
    }

    /* MODALS */
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'announcement_modal') {
            await interaction.deferReply({ flags: 64 });
            const title = interaction.fields.getTextInputValue('ann_title');
            const badge = interaction.fields.getTextInputValue('ann_badge').toUpperCase();
            const body = interaction.fields.getTextInputValue('ann_body');

            try {
                await db.execute(`
                    INSERT INTO announcements (title, body, badge, status, created_by, created_at)
                    VALUES (?, ?, ?, 'LIVE', (SELECT id FROM users WHERE discord_id = ?), NOW())
                `, [title, body, badge, interaction.user.id]);

                const colors = { INFO: '#3498db', UPDATE: '#2ecc71', IMPORTANT: '#e74c3c' };
                const announceEmbed = new EmbedBuilder()
                    .setTitle(`[${badge}] ${title}`)
                    .setDescription(body)
                    .setColor(colors[badge] || '#ffffff')
                    .setTimestamp();

                const channel = interaction.guild.channels.cache.get(process.env.NEWS_CHANNEL_ID);
                if (channel) await channel.send({ embeds: [announceEmbed] });
                await interaction.editReply({ content: '✅ Published!' });
            } catch (err) {
                console.error(err);
                await interaction.editReply({ content: '❌ Database Error.' });
            }
        }
    }

    /* BUTTONS (Marriage) */
    if (interaction.isButton()) {
        const parts = interaction.customId.split('_');
        if (parts[0] === 'marry') {
            const [,, proposerId, targetId] = parts;
            const action = parts[1];

            if (interaction.user.id !== targetId) return interaction.reply({ content: '❌ Not for you.', flags: 64 });

            try {
                if (action === 'reject') return interaction.update({ content: '💔 Proposal rejected.', components: [] });

                if (action === 'accept') {
                    await syncUserToDB(client.users.cache.get(proposerId));
                    await syncUserToDB(client.users.cache.get(targetId));

                    const [[proposer]] = await db.query('SELECT id FROM users WHERE discord_id = ?', [proposerId]);
                    const [[target]] = await db.query('SELECT id FROM users WHERE discord_id = ?', [targetId]);

                    if (!proposer || !target) return interaction.update({ content: '❌ User data missing.', components: [] });

                    const [[exists]] = await db.query(
                        `SELECT id FROM marriages WHERE (user1_id=? AND user2_id=?) OR (user1_id=? AND user2_id=?)`,
                        [proposer.id, target.id, target.id, proposer.id]
                    );

                    if (exists) return interaction.update({ content: '💍 Already married!', components: [] });

                    await db.query('INSERT INTO marriages (user1_id, user2_id) VALUES (?, ?)', [proposer.id, target.id]);
                    return interaction.update({ content: `💍 **Marriage confirmed!**\n<@${proposerId}> ❤️ <@${targetId}>`, components: [] });
                }
            } catch (err) {
                console.error(err);
                if(!interaction.replied) return interaction.reply({ content: '❌ DB Error.', flags: 64 });
            }
        }
    }
});

/* ============================
   5. LISTENERS & AUTO-DEPLOY
============================ */
client.on('messageCreate', (message) => {
    syncUserToDB(message.author);
    message.mentions.users.forEach(u => syncUserToDB(u));
});

client.on('guildMemberAdd', (member) => {
    syncUserToDB(member.user);
});

// Use 'clientReady' instead of 'ready' to fix the warning
client.once('clientReady', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    
    const guildId = process.env.GUILD_ID;
    
    if (!guildId) {
        console.error("❌ GUILD_ID is missing from .env!");
        return;
    }

    const guild = client.guilds.cache.get(guildId);
    
    // 1. SYNC MEMBERS
    if (guild) {
        await syncAllGuildMembers(guild);
    } else {
        console.warn(`[WARN] Bot is not in guild ID: ${guildId}`);
    }

    // 2. REGISTER COMMANDS (AUTO-DEPLOY)
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
    try {
        console.log(`[CMD] 🔄 Refreshing ${commandsArray.length} application (/) commands...`);
        
        // This pushes the commands to Discord immediately
        await rest.put(
            Routes.applicationGuildCommands(client.user.id, guildId),
            { body: commandsArray },
        );

        console.log(`[CMD] ✅ Successfully registered commands for ${guild ? guild.name : guildId}`);
    } catch (error) {
        console.error('[CMD] ❌ Deploy Error:', error);
    }
});

/* ============================
   6. LOGIN
============================ */
setInterval(async () => {
    try { await db.query('SELECT 1'); } 
    catch (err) { console.error('💔 DB Heartbeat failed'); }
}, 60000);

client.login(process.env.DISCORD_BOT_TOKEN);
