require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials, Collection, EmbedBuilder } = require('discord.js');
const db = require('./db');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions // 🔥 Required for Starboard
    ],
    // 🔥 Partials allow the bot to process reactions on old messages
    partials: [Partials.Channel, Partials.Message, Partials.Reaction] 
});

// CRASH PROTECTION
process.on('unhandledRejection', error => console.error('⚠️ Unhandled Rejection:', error));
process.on('uncaughtException', error => console.error('🚨 Uncaught Exception:', error));

/* ============================
   LOAD SLASH COMMANDS
============================ */
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        client.commands.set(command.data.name, command);
    }
}

/* ============================
   INTERACTION HANDLER
============================ */
client.on('interactionCreate', async interaction => {
    
    // 1. SLASH COMMANDS
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction);
        } catch (err) {
            console.error(err);
            const msg = { content: '❌ Command error.', flags: 64 };
            if (interaction.replied || interaction.deferred) await interaction.editReply(msg);
            else await interaction.reply(msg);
        }
    }

    // 2. MODAL SUBMISSIONS (For Announcements)
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'announcement_modal') {
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

                await interaction.reply({ content: '✅ Published to Web & Discord!', flags: 64 });
            } catch (err) {
                console.error(err);
                await interaction.reply({ content: '❌ DB Error.', flags: 64 });
            }
        }
    }

    // 3. BUTTONS (Marriage)
    if (interaction.isButton()) {
        const parts = interaction.customId.split('_');
        if (parts[0] !== 'marry') return;

        const [,, proposerId, targetId] = parts;
        const action = parts[1];

        if (interaction.user.id !== targetId) return interaction.reply({ content: '❌ Not for you.', flags: 64 });

        try {
            if (action === 'reject') return interaction.update({ content: '💔 Rejected.', components: [] });

            if (action === 'accept') {
                const [[proposer]] = await db.query('SELECT id FROM users WHERE discord_id = ?', [proposerId]);
                const [[target]] = await db.query('SELECT id FROM users WHERE discord_id = ?', [targetId]);

                const [[exists]] = await db.query(
                    `SELECT id FROM marriages WHERE (user1_id=? AND user2_id=?) OR (user1_id=? AND user2_id=?)`,
                    [proposer.id, target.id, target.id, proposer.id]
                );

                if (exists) return interaction.update({ content: '💍 Already married!', components: [] });

                await db.query('INSERT INTO marriages (user1_id, user2_id) VALUES (?, ?)', [proposer.id, target.id]);
                return interaction.update({ content: `💍 **Marriage confirmed!** <@${proposerId}> ❤️ <@${targetId}>`, components: [] });
            }
        } catch (err) {
            console.error(err);
            return interaction.reply({ content: '❌ DB Lag.', flags: 64 });
        }
    }
});

/* ============================
   DYNAMIC EVENT LOADER
============================ */
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) {
        const event = require(path.join(eventsPath, file));
        event(client); 
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
    console.log('🛑 Shutting down...');
    await db.end();
    client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_BOT_TOKEN);