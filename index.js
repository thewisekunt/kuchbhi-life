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
   4. INTERACTION HANDLER
============================ */

const NO_DEFER_COMMANDS = ['announce'];

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
          await interaction.deferReply({ ephemeral: isPrivate });
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
          ephemeral: true
        });
      }
    }

    return;
  }

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
              ephemeral: true
            });
          }

          return;
        }
      }
    }

    if (interaction.customId === 'announcement_modal') {

      await interaction.deferReply({ ephemeral: true });

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
     BUTTONS
  ============================ */
  if (interaction.isButton()) {

    /* ============================
       AWARDS VOTING
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
            ephemeral: true
          });
        }

        if (new Date() > new Date(category.end_time)) {
          return interaction.reply({
            content: '⏳ Voting has ended.',
            ephemeral: true
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
            ephemeral: true
          });
        }

        await db.query(
          `INSERT INTO awards_votes (category_id, nominee_id, voter_id)
           VALUES (?, ?, ?)`,
          [categoryId, nomineeId, interaction.user.id]
        );

        await interaction.reply({
          content: '✅ Your vote has been recorded!',
          ephemeral: true
        });

      } catch (err) {
        console.error('Award vote error:', err);

        if (!interaction.replied) {
          await interaction.reply({
            content: '❌ Failed to record vote.',
            ephemeral: true
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
              ephemeral: true
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
        ephemeral: true
      });
    }
  }

});

/* ============================
   LOGIN
============================ */

client.login(process.env.DISCORD_BOT_TOKEN);
