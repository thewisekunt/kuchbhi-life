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

// Crash protection
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
   4.1 MESSAGE HANDLER (Fixers & Pranks)
============================ */
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // --- A. INSTAGRAM LINK FIXER ---
  const instaRegex = /(https?:\/\/(?:www\.)?instagram\.com\/[^\s]+)/g;
  if (instaRegex.test(message.content)) {
    const fixedContent = message.content.replace(instaRegex, (match) => {
      let newLink = match.replace(/instagram\.com/, 'instagramkk.com');
      newLink = newLink.replace(/[\?&]igsh=[^&\s]+/, '');
      newLink = newLink.replace(/[\?&]utm_[^&\s]+/g, '');
      return newLink.replace(/[\?&]$/, '');
    });

    if (fixedContent !== message.content) {
      try {
        await message.reply({
          content: `Fixed Instagram Link:\n${fixedContent}`,
          allowedMentions: { repliedUser: false }
        });
      } catch (err) {
        console.error('Failed to send fixed link:', err);
      }
    }
  }

  // --- B. THE "NIER" PRANK ---
  const TARGET_ID = '287878305397604352';
  const triggers = ['nier', '🦌'];
  const hasTrigger = triggers.some(t => message.content.toLowerCase().includes(t));

  if (message.author.id === TARGET_ID && hasTrigger) {
    try {
      const countdownMsg = await message.reply({
        content: `⚠️ **TRIGGER SUCCESSFUL FOR NUKE**\nInitializing protocol... Fake Nuking **${message.guild.name}** in 5 seconds.`
      });

      let seconds = 4;
      const interval = setInterval(async () => {
        if (seconds > 0) {
          await countdownMsg.edit(`⚠️ **TRIGGER SUCCESSFUL FOR NUKE**\nInitializing protocol... Fake Nuking **${message.guild.name}** in ${seconds} seconds.`);
          seconds--;
        } else {
          clearInterval(interval);
          await countdownMsg.edit(`💥 **[SYSTEM ERROR]**\nNuke failed: Connection to "egirl_database" timed out. Just kidding, stay safe!`);
        }
      }, 1000);
    } catch (err) {
      console.error('Prank Error:', err);
    }
  }
});



/* ============================
   4. INTERACTION HANDLER
============================ */

// ADDED 'poll' and 'imposter' to prevent double-reply crashes
const NO_DEFER_COMMANDS = ['announce', 'poll', 'imposter'];

client.on('interactionCreate', async interaction => {

  if (interaction.user) {
    ensureUser(interaction.user).catch(() => {});
  }

  /* ============================
     SLASH COMMANDS
  ============================ */
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {

      if (
        !NO_DEFER_COMMANDS.includes(interaction.commandName) &&
        interaction.commandName !== 'gamemaster'
      ) {

        const isPrivate = [
          'balance',
          'work',
          'daily',
          'rose',
          'confess',
          'inbox'
        ].includes(interaction.commandName);

        if (!interaction.deferred && !interaction.replied) {
          // Replaced ephemeral with flags: 64 to fix deprecation warning
          const deferOpts = isPrivate ? { flags: 64 } : {};
          await interaction.deferReply(deferOpts);
        }
      }

      await command.execute(interaction);

    } catch (err) {
      console.error(`❌ Command Error [${interaction.commandName}]`, err);

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply('❌ An internal error occurred.');
      } else {
        await interaction.reply({
          content: '❌ An internal error occurred.',
          flags: 64 // Replaced ephemeral
        });
      }
    }

    return;
  }


/* ============================
   5. INSTAGRAM LINK FIXER
============================ */
client.on('messageCreate', async (message) => {
  // Ignore messages from bots to prevent infinite loops
  if (message.author.bot) return;

  // Regex to find instagram.com or www.instagram.com links
  const instaRegex = /(https?:\/\/(?:www\.)?instagram\.com\/[^\s]+)/g;
  
  if (instaRegex.test(message.content)) {
    const fixedContent = message.content.replace(instaRegex, (match) => {
      // 1. Change domain to instagramkk.com
      let newLink = match.replace(/instagram\.com/, 'instagramkk.com');
      
      // 2. Remove the 'igsh' tracker and everything after it in the query string
      // Also removes utm trackers commonly found in these links
      newLink = newLink.replace(/[\?&]igsh=[^&\s]+/, '');
      newLink = newLink.replace(/[\?&]utm_[^&\s]+/g, '');

      // Clean up trailing '?' or '&' if they are left over
      newLink = newLink.replace(/[\?&]$/, '');
      
      return newLink;
    });

    // Only send a message if the content actually changed
    if (fixedContent !== message.content) {
      try {
        await message.reply({
          content: `Fixed Instagram Link:\n${fixedContent}`,
          allowedMentions: { repliedUser: false } // Don't ping the user again
        });
      } catch (err) {
        console.error('Failed to send fixed link:', err);
      }
    }
  }
});

  

  /* ============================
     MODALS
  ============================ */
  if (interaction.isModalSubmit()) {

    for (const command of client.commands.values()) {
      if (typeof command.handleModalSubmit === 'function') {
        try {
          await command.handleModalSubmit(interaction);
          return;
        } catch (err) {
          console.error('Modal routing error:', err);

          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: '❌ Modal error.',
              flags: 64 // Replaced ephemeral
            });
          }

          return;
        }
      }
    }

    if (interaction.customId === 'announcement_modal') {

      await interaction.deferReply({ flags: 64 }); // Replaced ephemeral

      try {
        const title = interaction.fields.getTextInputValue('ann_title');
        const badge = interaction.fields.getTextInputValue('ann_badge').toUpperCase();
        const body = interaction.fields.getTextInputValue('ann_body');

        await db.execute(`
          INSERT INTO announcements (title, body, badge, status, created_by, created_at)
          VALUES (?, ?, ?, 'LIVE', (SELECT id FROM users WHERE discord_id=?), NOW())
        `, [title, body, badge, interaction.user.id]);

        const channel = interaction.guild.channels.cache.get(process.env.NEWS_CHANNEL_ID);

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

    return;
  }

  /* ============================
     SELECT MENUS (POLLS)
  ============================ */
  if (interaction.isStringSelectMenu()) {
    
    // AWARDS POLL LOGIC
    if (interaction.customId.startsWith('award_poll_')) {
      const categoryId = interaction.customId.replace('award_poll_', '');
      const selectedNomineeId = interaction.values[0]; // The internal DB ID of the nominee

      try {
        // 1. Ensure the user is registered in the database
        const [[voter]] = await db.query('SELECT id FROM users WHERE discord_id = ?', [interaction.user.id]);
        
        if (!voter) {
          return interaction.reply({ 
            content: '❌ You must log in to the website (`kuchbhi.life`) at least once to register before voting.', 
            flags: 64 
          });
        }

        // 2. Check if the category is still open
        const [[category]] = await db.query('SELECT is_open FROM award_categories WHERE id = ?', [categoryId]);
        
        if (!category || !category.is_open) {
          return interaction.reply({ 
            content: '🔴 Voting for this category has officially closed!', 
            flags: 64 
          });
        }

        // 3. Upsert the vote (Insert if new, Update if changing vote)
        await db.query(`
            INSERT INTO award_votes (category_id, nominee_id, voter_id) 
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE nominee_id = VALUES(nominee_id)
        `, [categoryId, selectedNomineeId, voter.id]);

        // 4. Send Anonymous Confirmation
        await interaction.reply({ 
          content: '✅ Your vote has been securely and anonymously recorded! You can change it by selecting a different name before the poll closes.', 
          flags: 64 
        });

      } catch (err) {
        console.error('Poll Voting Error:', err);
        await interaction.reply({ 
          content: '❌ A database error occurred while recording your vote.', 
          flags: 64 
        });
      }
      return;
    }
  }



  

  /* ============================
     BUTTONS
  ============================ */
  if (interaction.isButton()) {
    
  if (interaction.customId.startsWith('kbc_')) return;
    
    /* ============================
       AWARDS VOTING (Legacy Buttons)
    ============================ */
    if (interaction.customId.startsWith('awardvote_')) {

      const parts = interaction.customId.split('_');
      const categoryId = parts[1];
      const nomineeId = parts[2];

      try {

        const [[category]] = await db.query(
          `SELECT end_time FROM awards_categories WHERE id=?`,
          [categoryId]
        );

        if (!category) {
          return interaction.reply({
            content: '❌ Award category not found.',
            flags: 64 // Replaced ephemeral
          });
        }

        if (new Date() > new Date(category.end_time)) {
          return interaction.reply({
            content: '⏳ Voting has ended.',
            flags: 64 // Replaced ephemeral
          });
        }

        const [existing] = await db.query(
          `SELECT id FROM awards_votes
           WHERE category_id=? AND voter_id=?`,
          [categoryId, interaction.user.id]
        );

        if (existing.length > 0) {
          return interaction.reply({
            content: '⚠️ You have already voted for this category.',
            flags: 64 // Replaced ephemeral
          });
        }

        await db.query(
          `INSERT INTO awards_votes (category_id, nominee_id, voter_id)
           VALUES (?, ?, ?)`,
          [categoryId, nomineeId, interaction.user.id]
        );

        await interaction.reply({
          content: '✅ Your vote has been recorded!',
          flags: 64 // Replaced ephemeral
        });

      } catch (err) {
        console.error('Award vote error:', err);

        if (!interaction.replied) {
          await interaction.reply({
            content: '❌ Failed to record vote.',
            flags: 64 // Replaced ephemeral
          });
        }
      }

      return;
    }

    /* ============================
       ROUTE TO COMMAND BUTTONS
    ============================ */

    for (const command of client.commands.values()) {
      if (typeof command.handleButtonClick === 'function') {
        try {
          await command.handleButtonClick(interaction);
          if (interaction.replied || interaction.deferred) return;
        } catch (err) {
          console.error('Button routing error:', err);
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: '❌ Button error.',
              flags: 64 // Replaced ephemeral
            });
          }
          return;
        }
      }
    }

    /* ============================
       FALLBACK
    ============================ */

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '⚠️ Unknown interaction.',
        flags: 64 // Replaced ephemeral
      });
    }
  }

});

/* ============================
   LOGIN
============================ */

client.login(process.env.DISCORD_BOT_TOKEN);
