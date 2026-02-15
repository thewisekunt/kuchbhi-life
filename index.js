require('dotenv').config();

const fs = require('fs');
const path = require('path');
const http = require('http');
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  EmbedBuilder
} = require('discord.js');

const db = require('./db');
const ensureUser = require('./utils/ensureUser');

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

// Global crash protection
process.on('unhandledRejection', err =>
  console.error('⚠️ Unhandled Rejection:', err)
);
process.on('uncaughtException', err =>
  console.error('🚨 Uncaught Exception:', err)
);

/* ============================
   2. COMMAND LOADER
============================ */
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
  const files = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

  for (const file of files) {
    try {
      const command = require(path.join(commandsPath, file));
      if (command?.data && command?.execute) {
        client.commands.set(command.data.name, command);
      }
    } catch (err) {
      console.error(`❌ Failed to load command ${file}:`, err.message);
    }
  }
}

/* ============================
   3. EVENT LOADER
============================ */
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
  const files = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));

  for (const file of files) {
    try {
      const event = require(path.join(eventsPath, file));
      event(client);
      console.log(`✅ Event loaded: ${file}`);
    } catch (err) {
      console.error(`❌ Failed to load event ${file}:`, err.message);
    }
  }
}

/* ============================
   4. INTERACTION HANDLER
============================ */
const NO_DEFER_COMMANDS = ['announce'];

client.on('interactionCreate', async interaction => {
  // Background user safety (non-blocking)
  if (interaction.user) {
    ensureUser(interaction.user).catch(() => {});
  }

  /* -------- SLASH COMMANDS -------- */
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      if (!NO_DEFER_COMMANDS.includes(interaction.commandName)) {
        const isPrivate = ['balance', 'work', 'daily', 'rose', 'confess', 'inbox'].includes(
  interaction.commandName
);

        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ ephemeral: isPrivate });
        }
      }

      await command.execute(interaction);
    } catch (err) {
      console.error(`❌ Command Error [${interaction.commandName}]`, err);

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(
          '❌ An internal error occurred while running this command.'
        );
      } else {
        await interaction.reply({
          content: '❌ An internal error occurred.',
          ephemeral: true
        });
      }
    }
  }

  /* -------- MODALS -------- */
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'announcement_modal') {
      await interaction.deferReply({ ephemeral: true });

      const title = interaction.fields.getTextInputValue('ann_title');
      const badge = interaction.fields
        .getTextInputValue('ann_badge')
        .toUpperCase();
      const body = interaction.fields.getTextInputValue('ann_body');

      try {
        await db.execute(
          `
          INSERT INTO announcements (title, body, badge, status, created_by, created_at)
          VALUES (?, ?, ?, 'LIVE', (SELECT id FROM users WHERE discord_id=?), NOW())
        `,
          [title, body, badge, interaction.user.id]
        );

        const channel =
          interaction.guild.channels.cache.get(
            process.env.NEWS_CHANNEL_ID
          );

        if (channel) {
          const embed = new EmbedBuilder()
            .setTitle(`[${badge}] ${title}`)
            .setDescription(body)
            .setColor('#3498db')
            .setTimestamp();

          await channel.send({ embeds: [embed] });
        }

        await interaction.editReply('✅ Announcement published!');
      } catch (err) {
        console.error(err);
        await interaction.editReply('❌ Failed to publish announcement.');
      }
    }
  }

  /* -------- BUTTONS -------- */
  if (interaction.isButton()) {
    const parts = interaction.customId.split('_');

    /* MARRY */
    if (parts[0] === 'marry') {
      const [, action, proposerId, targetId] = parts;

      if (interaction.user.id !== targetId) {
        return interaction.reply({
          content: '❌ This choice is not for you.',
          ephemeral: true
        });
      }

      if (action === 'reject') {
        return interaction.update({
          content: '💔 The proposal was rejected.',
          components: []
        });
      }

      if (action === 'accept') {
        try {
          const [[p]] = await db.query(
            `SELECT id FROM users WHERE discord_id=?`,
            [proposerId]
          );
          const [[t]] = await db.query(
            `SELECT id FROM users WHERE discord_id=?`,
            [targetId]
          );

          if (!p || !t) {
            return interaction.update({
              content: '❌ User data missing.',
              components: []
            });
          }

          await db.query(
            `INSERT INTO marriages (user1_id, user2_id) VALUES (?, ?)`,
            [p.id, t.id]
          );

          return interaction.update({
            content: `💍 <@${proposerId}> ❤️ <@${targetId}>`,
            components: []
          });
        } catch (err) {
          console.error(err);
          return interaction.update({
            content: '❌ Marriage failed.',
            components: []
          });
        }
      }
    }

    /* DIVORCE */
    if (parts[0] === 'divorce') {
      const [, action, userId] = parts;

      if (interaction.user.id !== userId) {
        return interaction.reply({
          content: '❌ This decision is not yours.',
          ephemeral: true
        });
      }

      if (action === 'cancel') {
        return interaction.update({
          content: '❎ Divorce cancelled.',
          components: []
        });
      }

      if (action === 'confirm') {
        try {
          await db.query(
            `
            DELETE m FROM marriages m
            JOIN users u1 ON u1.id = m.user1_id
            JOIN users u2 ON u2.id = m.user2_id
            WHERE u1.discord_id=? OR u2.discord_id=?
          `,
            [userId, userId]
          );

          return interaction.update({
            content: '💔 Divorce finalized.',
            components: []
          });
        } catch (err) {
          console.error(err);
          return interaction.update({
            content: '❌ Divorce failed.',
            components: []
          });
        }
      }
    }
  }
});

/* ============================
   5. TEXT COMMANDS (!exit)
============================ */
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // 1. Sync User to DB (Best Effort)
  ensureUser(message.author).catch(() => {});

  // 2. !exit Command Logic
  if (message.content.toLowerCase() === '!exit') {
    if (!message.guild) return message.reply("Bro, you can't exit a DM. Block me instead.");

    // Check Permissions
    if (!message.guild.members.me.permissions.has('KickMembers')) {
      return message.reply("❌ I don't have perms to kick people. I'm just a bot, not God.");
    }

    if (!message.member.kickable) {
      return message.reply("❌ I can't kick you. You're too powerful (Admin/Owner). Suffering from success?");
    }

    // 3. Funny Leave Messages
    const leaveMessages = [
      `👋 **${message.author.username}** has left the building. Elvis has left the chat.`,
      `👋 **${message.author.username}** decided to touch grass. Respect.`,
      `👋 **${message.author.username}** rage quit. GG no re.`,
      `👋 **${message.author.username}** vanished like my dad getting milk.`,
      `👋 **${message.author.username}** has ascended to a higher plane of existence (left the server).`,
      `👋 **${message.author.username}** yeeted themselves out.`,
      `👋 **${message.author.username}** chose violence and left.`,
      `👋 **${message.author.username}** was not the imposter.`
    ];

    const randomMsg = leaveMessages[Math.floor(Math.random() * leaveMessages.length)];

    try {
      // DM them first (if their DMs are open)
      await message.author.send("You used `!exit`. Don't let the door hit you on the way out! 👋").catch(() => {});

      // Kick 'em
      await message.member.kick("User used !exit command (Self-Yeet)");

      // Announce it
      await message.channel.send(randomMsg);

    } catch (err) {
      console.error(err);
      message.reply("❌ Failed to kick you. You're stuck here forever.");
    }
  }
});

/* ============================
   6. TEXT COMMANDS & LISTENERS
============================ */
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // 1. Sync User to DB (Best Effort)
    try { await ensureUser(message.author); } catch (e) {}

    // ============================
    //  AFK SYSTEM LOGIC
    // ============================
    
    // A. CHECK IF AUTHOR IS AFK -> REMOVE IT
    try {
        const [[afkEntry]] = await db.query(
            "SELECT * FROM afk WHERE user_id = (SELECT id FROM users WHERE discord_id = ?)", 
            [message.author.id]
        );

        if (afkEntry) {
            await db.query("DELETE FROM afk WHERE id = ?", [afkEntry.id]);
            const welcomeMsg = await message.reply(`👋 Welcome back **${message.author.username}**, I removed your AFK.`);
            setTimeout(() => welcomeMsg.delete().catch(() => {}), 10000); // Delete msg after 10s
        }
    } catch (err) { console.error("AFK Check Error:", err.message); }

    // B. CHECK IF MENTIONED USER IS AFK -> NOTIFY
    if (message.mentions.users.size > 0) {
        message.mentions.users.forEach(async (u) => {
            if (u.id === message.author.id) return; // Don't reply if mentioning self
            try {
                const [[targetAfk]] = await db.query(
                    "SELECT reason, created_at FROM afk WHERE user_id = (SELECT id FROM users WHERE discord_id = ?)", 
                    [u.id]
                );
                if (targetAfk) {
                    const timestamp = Math.floor(new Date(targetAfk.created_at).getTime() / 1000);
                    message.reply(`💤 **${u.username}** is AFK: ${targetAfk.reason} (<t:${timestamp}:R>)`);
                }
            } catch (err) {}
        });
    }

    // ============================
    //  TEXT COMMANDS
    // ============================

    // COMMAND: ,afk [Reason]
    if (message.content.startsWith(',afk')) {
        const reason = message.content.slice(5).trim() || 'Just chilling';
        try {
            const [[user]] = await db.query("SELECT id FROM users WHERE discord_id = ?", [message.author.id]);
            
            // Insert or Update AFK
            await db.query(
                `INSERT INTO afk (user_id, reason, created_at) VALUES (?, ?, NOW()) 
                 ON DUPLICATE KEY UPDATE reason = VALUES(reason), created_at = NOW()`,
                [user.id, reason]
            );

            message.reply(`💤 I set your AFK: **${reason}**`);
        } catch (err) {
            console.error(err);
            message.reply("❌ DB Error setting AFK.");
        }
        return;
    }

    // COMMAND: !exit (Kick Self)
    if (message.content.toLowerCase() === '!exit') {
        if (!message.guild) return message.reply("Bro, you can't exit a DM.");

        if (!message.guild.members.me.permissions.has('KickMembers')) {
            return message.reply("❌ I don't have perms to kick people.");
        }
        if (!message.member.kickable) {
            return message.reply("❌ I can't kick you (Admin/Owner).");
        }

        const leaveMessages = [
            `👋 **${message.author.username}** has left the building.`,
            `👋 **${message.author.username}** touched grass.`,
            `👋 **${message.author.username}** yeeted themselves.`
        ];
        const randomMsg = leaveMessages[Math.floor(Math.random() * leaveMessages.length)];

        try {
            await message.author.send("You used `!exit`. Goodbye! 👋").catch(() => {});
            await message.member.kick("User used !exit command");
            await message.channel.send(randomMsg);
        } catch (err) {
            message.reply("❌ Failed to kick you.");
        }
    }
});

/* ============================
   7. DB HEARTBEAT
============================ */
setInterval(async () => {
  try {
    await db.query('SELECT 1');
  } catch (err) {
    console.error('💔 DB heartbeat failed:', err.message);
  }
}, 60000);

/* ============================
   6. LOGIN
============================ */
client.login(process.env.DISCORD_BOT_TOKEN);
