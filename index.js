require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Collection, EmbedBuilder } = require('discord.js');
const db = require('./db');
const http = require('http');

// 0. DUMMY SERVER
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Kuch Bhi Bot is Online!');
}).listen(process.env.PORT || 8000);

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

// 1. CRASH PROTECTION
process.on('unhandledRejection', error => console.error('⚠️ Unhandled Rejection:', error));
process.on('uncaughtException', error => console.error('🚨 Uncaught Exception:', error));

/* ============================
   DATA SYNC FUNCTIONS (UPDATED FOR NAMES)
============================ */

// Helper 1: Sync a single user (Triggered by chat/interaction)
async function syncUserToDB(user) {
    if (!user || user.bot) return;

    // Use globalName if available, otherwise fallback to username
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
        console.error(`Failed to sync user ${user.username}:`, err.message);
    }
}

// Helper 2: Sync ALL members (Triggered on Startup)
async function syncAllGuildMembers(guild) {
    if (!guild) return;
    try {
        console.log(`[SYNC] Fetching members for ${guild.name}...`);
        const members = await guild.members.fetch();
        
        const usersData = [];
        members.forEach(m => {
            if (!m.user.bot) {
                // Prepare data: [id, username, global_name, avatar]
                const displayName = m.user.globalName || m.user.username;
                usersData.push([
                    m.user.id, 
                    m.user.username, 
                    displayName,
                    m.user.avatar || 'default'
                ]);
            }
        });

        if (usersData.length > 0) {
            // Bulk Insert with global_name
            await db.query(`
                INSERT INTO users (discord_id, username, global_name, avatar) VALUES ? 
                ON DUPLICATE KEY UPDATE 
                username=VALUES(username), 
                global_name=VALUES(global_name), 
                avatar=VALUES(avatar)
            `, [usersData]);
            console.log(`[SYNC] ✅ Successfully synced names for ${usersData.length} members.`);
        }
    } catch (err) {
        console.error("[SYNC] ❌ Failed:", err.message);
    }
}

/* ============================
   LOAD COMMANDS
============================ */
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
        try {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            if (command && 'data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
            }
        } catch (err) {
            console.error(`[ERROR] Failed to load command ${file}:`, err.message);
        }
    }
}

/* ============================
   INTERACTION HANDLER
============================ */
client.on('interactionCreate', async interaction => {
    syncUserToDB(interaction.user); // Sync on every click/command

    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ flags: 64 }); 
            await command.execute(interaction);
        } catch (err) {
            console.error('❌ Command Error:', err);
            if (interaction.deferred || interaction.replied) await interaction.editReply({ content: '❌ Error!' });
            else await interaction.reply({ content: '❌ Error!', flags: 64 });
        }
    }

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
                await interaction.editReply({ content: '❌ DB Error.' });
            }
        }
    }

    if (interaction.isButton()) {
        const parts = interaction.customId.split('_');
        if (parts[0] === 'marry') {
            const [,, proposerId, targetId] = parts;
            const action = parts[1];
            if (interaction.user.id !== targetId) return interaction.reply({ content: '❌ Not for you.', flags: 64 });

            if (action === 'reject') return interaction.update({ content: '💔 Rejected.', components: [] });
            if (action === 'accept') {
                try {
                    await syncUserToDB(client.users.cache.get(proposerId));
                    await syncUserToDB(client.users.cache.get(targetId));

                    const [[proposer]] = await db.query('SELECT id FROM users WHERE discord_id = ?', [proposerId]);
                    const [[target]] = await db.query('SELECT id FROM users WHERE discord_id = ?', [targetId]);
                    
                    if (!proposer || !target) return interaction.reply({ content: "❌ Error finding users.", flags: 64 });

                    const [[exists]] = await db.query(
                        `SELECT id FROM marriages WHERE (user1_id=? AND user2_id=?) OR (user1_id=? AND user2_id=?)`,
                        [proposer.id, target.id, target.id, proposer.id]
                    );

                    if (exists) return interaction.update({ content: '💍 Already married!', components: [] });

                    await db.query('INSERT INTO marriages (user1_id, user2_id) VALUES (?, ?)', [proposer.id, target.id]);
                    return interaction.update({ content: `💍 **Marriage confirmed!** <@${proposerId}> ❤️ <@${targetId}>`, components: [] });
                } catch (err) {
                    console.error(err);
                    return interaction.reply({ content: '❌ DB Error.', flags: 64 });
                }
            }
        }
    }
});

/* ============================
   LISTENERS (AUTO-SYNC)
============================ */
client.on('messageCreate', (message) => {
    syncUserToDB(message.author);
    message.mentions.users.forEach(u => syncUserToDB(u));
});

client.on('guildMemberAdd', (member) => {
    syncUserToDB(member.user);
});

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    const guild = client.guilds.cache.first();
    if (guild) await syncAllGuildMembers(guild);
});

/* ============================
   DYNAMIC EVENT LOADER
============================ */
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
        try {
            const event = require(path.join(eventsPath, file));
            event(client); 
        } catch (err) {
            console.error(`[ERROR] Failed event ${file}:`, err.message);
        }
    }
}

/* ============================
   DB HEARTBEAT & SHUTDOWN
============================ */
setInterval(async () => {
    try { await db.query('SELECT 1'); } 
    catch (err) { console.error('💔 DB Heartbeat failed'); }
}, 60000);

process.on('SIGINT', async () => {
    await db.end();
    client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);
