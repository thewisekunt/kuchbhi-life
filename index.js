require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Collection, EmbedBuilder } = require('discord.js');
const db = require('./db');
const http = require('http');

/* ============================
   0. HEALTH CHECK SERVER
   (Keeps bot alive on cloud hosts)
============================ */
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Kuch Bhi Bot is Online!');
}).listen(process.env.PORT || 8000);

/* ============================
   1. CLIENT SETUP & CRASH PROTECTION
============================ */
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers, // CRITICAL: Must be enabled in Dev Portal
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});

// Prevent bot from crashing on minor errors
process.on('unhandledRejection', error => console.error('⚠️ Unhandled Rejection:', error));
process.on('uncaughtException', error => console.error('🚨 Uncaught Exception:', error));

/* ============================
   2. DATA SYNC FUNCTIONS (Robust)
============================ */

// Helper: Sync a single user (Triggered by chat/interaction)
async function syncUserToDB(user) {
    if (!user || user.bot) return;

    // Use globalName (Display Name) if available, else username
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
        console.error(`[DB] Failed to sync user ${user.username}:`, err.message);
    }
}

// Helper: Sync ALL members (Chunked for safety)
async function syncAllGuildMembers(guild) {
    if (!guild) return;
    try {
        console.log(`[SYNC] 🔄 Fetching members for TARGET SERVER: ${guild.name}...`);
        
        // Force fetch from Discord API to get offline members too
        const members = await guild.members.fetch(); 
        console.log(`[SYNC] 📡 Discord returned ${members.size} members.`);

        const allUsersData = [];
        members.forEach(m => {
            if (!m.user.bot) {
                const displayName = m.user.globalName || m.user.username;
                allUsersData.push([
                    m.user.id, 
                    m.user.username, 
                    displayName,
                    m.user.avatar || 'default'
                ]);
            }
        });

        if (allUsersData.length === 0) return console.log("[SYNC] ⚠️ No humans found.");

        // Split into chunks of 50 to prevent Database Timeout
        const chunkSize = 50;
        console.log(`[SYNC] 💾 Saving ${allUsersData.length} users in batches...`);

        for (let i = 0; i < allUsersData.length; i += chunkSize) {
            const chunk = allUsersData.slice(i, i + chunkSize);
            
            await db.query(`
                INSERT INTO users (discord_id, username, global_name, avatar) VALUES ? 
                ON DUPLICATE KEY UPDATE 
                username=VALUES(username), 
                global_name=VALUES(global_name), 
                avatar=VALUES(avatar)
            `, [chunk]);
            
            console.log(`[SYNC] ✅ Saved batch ${i} - ${i + chunk.length}`);
        }

        console.log("[SYNC] 🎉 Full Sync Complete!");

    } catch (err) {
        console.error("[SYNC] ❌ Critical Failure:", err);
    }
}

/* ============================
   3. COMMAND LOADER
============================ */
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
        try {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            // Verify command structure before loading
            if (command && 'data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
            } else {
                console.warn(`[SKIP] ${file} missing data/execute properties.`);
            }
        } catch (err) {
            console.error(`[ERROR] Failed to load command ${file}:`, err.message);
        }
    }
}

/* ============================
   4. INTERACTION HANDLER
============================ */
client.on('interactionCreate', async interaction => {
    
    // Always sync user who interacts
    syncUserToDB(interaction.user);

    /* ---------- SLASH COMMANDS ---------- */
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            // NOTE: We do NOT auto-defer here anymore. 
            // Individual command files (work.js, roast.js) must handle interaction.reply() or interaction.deferReply()
            await command.execute(interaction);
        } catch (err) {
            console.error('❌ Command Error:', err);
            // Safe Error Reply
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ An error occurred.', flags: 64 });
            } else if (interaction.deferred && !interaction.replied) {
                await interaction.editReply({ content: '❌ An error occurred.' });
            }
        }
    }

    /* ---------- MODAL SUBMISSIONS ---------- */
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

                // Post to Discord Channel
                const colors = { INFO: '#3498db', UPDATE: '#2ecc71', IMPORTANT: '#e74c3c' };
                const announceEmbed = new EmbedBuilder()
                    .setTitle(`[${badge}] ${title}`)
                    .setDescription(body)
                    .setColor(colors[badge] || '#ffffff')
                    .setTimestamp();

                const channel = interaction.guild.channels.cache.get(process.env.NEWS_CHANNEL_ID);
                if (channel) await channel.send({ embeds: [announceEmbed] });

                await interaction.editReply({ content: '✅ Published successfully!' });
            } catch (err) {
                console.error(err);
                await interaction.editReply({ content: '❌ Database Error.' });
            }
        }
    }

    /* ---------- BUTTONS (Marriage) ---------- */
    if (interaction.isButton()) {
        const parts = interaction.customId.split('_');
        
        if (parts[0] === 'marry') {
            const [,, proposerId, targetId] = parts;
            const action = parts[1];

            if (interaction.user.id !== targetId) {
                return interaction.reply({ content: '❌ This proposal is not for you.', flags: 64 });
            }

            try {
                if (action === 'reject') {
                    return interaction.update({ content: '💔 Proposal rejected.', components: [] });
                }

                if (action === 'accept') {
                    // Sync users to ensure DB IDs exist
                    await syncUserToDB(client.users.cache.get(proposerId));
                    await syncUserToDB(client.users.cache.get(targetId));

                    const [[proposer]] = await db.query('SELECT id FROM users WHERE discord_id = ?', [proposerId]);
                    const [[target]] = await db.query('SELECT id FROM users WHERE discord_id = ?', [targetId]);

                    if (!proposer || !target) {
                        return interaction.update({ content: '❌ User data missing from DB. Try again.', components: [] });
                    }

                    // Check if already married
                    const [[exists]] = await db.query(
                        `SELECT id FROM marriages WHERE (user1_id=? AND user2_id=?) OR (user1_id=? AND user2_id=?)`,
                        [proposer.id, target.id, target.id, proposer.id]
                    );

                    if (exists) {
                        return interaction.update({ content: '💍 You are already married!', components: [] });
                    }

                    // Create Marriage
                    await db.query('INSERT INTO marriages (user1_id, user2_id) VALUES (?, ?)', [proposer.id, target.id]);

                    return interaction.update({
                        content: `💍 **Marriage confirmed!**\n<@${proposerId}> ❤️ <@${targetId}>`,
                        components: []
                    });
                }
            } catch (err) {
                console.error(err);
                if(!interaction.replied) return interaction.reply({ content: '❌ Database Error.', flags: 64 });
            }
        }
    }
});

/* ============================
   5. EVENT LISTENERS
============================ */

// Sync on Message
client.on('messageCreate', (message) => {
    syncUserToDB(message.author);
    message.mentions.users.forEach(u => syncUserToDB(u));
});

// Sync on Join
client.on('guildMemberAdd', (member) => {
    syncUserToDB(member.user);
});

// READY EVENT (Targeted Sync)
client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    
    // --- ⬇️ REPLACE THIS WITH YOUR REAL SERVER ID ⬇️ ---
    const TARGET_GUILD_ID = 'YOUR_REAL_SERVER_ID_HERE'; 
    // ---------------------------------------------------

    const guild = client.guilds.cache.get(TARGET_GUILD_ID);
    
    if (guild) {
        await syncAllGuildMembers(guild);
    } else {
        console.warn(`[WARN] Could not find guild ${TARGET_GUILD_ID}. Bot is in:`);
        client.guilds.cache.forEach(g => console.log(`- ${g.name} (${g.id})`));
    }
});

/* ============================
   6. DYNAMIC EVENT LOADING (Optional)
============================ */
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
        try {
            // Avoid reloading 'ready' or 'messageCreate' if we defined them above
            if (file === 'ready.js' || file === 'messageCreate.js') continue;
            
            const event = require(path.join(eventsPath, file));
            if (typeof event === 'function') event(client);
        } catch (err) {
            console.error(`[ERROR] Failed to load event ${file}:`, err.message);
        }
    }
}

/* ============================
   7. DB HEARTBEAT & LOGIN
============================ */
setInterval(async () => {
    try { await db.query('SELECT 1'); } 
    catch (err) { console.error('💔 DB Heartbeat failed'); }
}, 60000);

client.login(process.env.DISCORD_BOT_TOKEN);
