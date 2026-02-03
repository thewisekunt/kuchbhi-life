require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Collection, EmbedBuilder, REST, Routes } = require('discord.js');
const db = require('./db');
const http = require('http');

/* ============================
   0. HEALTH CHECK SERVER
   Keep this for Koyeb/Cloud 24/7 stability
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

// Global Crash Protection
process.on('unhandledRejection', error => console.error('⚠️ Unhandled Rejection:', error));
process.on('uncaughtException', error => console.error('🚨 Uncaught Exception:', error));

/* ============================
   2. DATA SYNC HELPER
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
        console.error(`[DB] Sync failed for ${user.username}: ${err.message}`);
    }
}

/* ============================
   3. COMMAND LOADER & DEPLOYER
============================ */
client.commands = new Collection();
const commandsArray = [];
const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
        try {
            const command = require(path.join(commandsPath, file));
            if (command && 'data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                commandsArray.push(command.data.toJSON());
            }
        } catch (err) {
            console.error(`[ERROR] Failed to load command ${file}:`, err.message);
        }
    }
}

/* ============================
   4. EVENT LOADER (CRITICAL FOR STATS)
   This is what connects your message/voice files
============================ */
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
        try {
            const event = require(path.join(eventsPath, file));
            event(client); // This initializes your listeners
            console.log(`[EVENT] ✅ Loaded: ${file}`);
        } catch (err) {
            console.error(`[ERROR] Failed to load event ${file}:`, err.message);
        }
    }
}

/* ============================
   5. INTERACTION HANDLER
============================ */
client.on('interactionCreate', async interaction => {
    // Sync the interacting user
    syncUserToDB(interaction.user);

    // SLASH COMMANDS
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            // Global defer to prevent "Unknown Interaction" errors
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferReply({ flags: 64 });
            }
            await command.execute(interaction);
        } catch (err) {
            console.error('❌ Command Error:', err);
            const errorMsg = { content: '❌ An error occurred.', flags: 64 };
            if (interaction.deferred || interaction.replied) await interaction.editReply(errorMsg);
            else await interaction.reply(errorMsg);
        }
    }

    // MODALS
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

                const channel = interaction.guild.channels.cache.get(process.env.NEWS_CHANNEL_ID);
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setTitle(`[${badge}] ${title}`)
                        .setDescription(body)
                        .setColor('#3498db').setTimestamp();
                    await channel.send({ embeds: [embed] });
                }
                await interaction.editReply('✅ Published!');
            } catch (err) {
                console.error(err);
                await interaction.editReply('❌ DB Error.');
            }
        }
    }

    // BUTTONS
    if (interaction.isButton()) {
        const parts = interaction.customId.split('_');
        if (parts[0] === 'marry') {
            const [,, proposerId, targetId] = parts;
            const action = parts[1];
            if (interaction.user.id !== targetId) return interaction.reply({ content: '❌ Not for you.', flags: 64 });

            try {
                if (action === 'reject') return interaction.update({ content: '💔 Rejected.', components: [] });
                if (action === 'accept') {
                    const [[proposer]] = await db.query('SELECT id FROM users WHERE discord_id = ?', [proposerId]);
                    const [[target]] = await db.query('SELECT id FROM users WHERE discord_id = ?', [targetId]);
                    if (!proposer || !target) return interaction.update({ content: '❌ Data missing.', components: [] });

                    await db.query('INSERT INTO marriages (user1_id, user2_id) VALUES (?, ?)', [proposer.id, target.id]);
                    return interaction.update({ content: `💍 **Marriage confirmed!** <@${proposerId}> ❤️ <@${targetId}>`, components: [] });
                }
            } catch (err) {
                console.error(err);
                if (!interaction.replied) interaction.reply({ content: '❌ DB Error.', flags: 64 });
            }
        }
    }
});

/* ============================
   6. ON READY: SYNC & DEPLOY
============================ */
client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    const guildId = process.env.GUILD_ID;
    if (!guildId) return console.error("❌ GUILD_ID missing from .env");

    // Register Slash Commands
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
    try {
        console.log(`[CMD] 🔄 Refreshing commands...`);
        await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commandsArray });
        console.log(`[CMD] ✅ Commands Registered.`);
    } catch (error) {
        console.error('[CMD] ❌ Deploy Error:', error);
    }
});

/* ============================
   7. DB HEARTBEAT & LOGIN
============================ */
setInterval(async () => {
    try { await db.query('SELECT 1'); } 
    catch (err) { console.error('💔 DB Heartbeat failed'); }
}, 60000);

client.login(process.env.DISCORD_BOT_TOKEN);
