require('dotenv').config();

const fs = require('fs');
const path = require('path');
const http = require('http');
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder
} = require('discord.js');

const db = require('./db');
const ensureUser = require('./utils/ensureUser');

// Global Game Tracker
const activeGames = new Map();

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
        await interaction.editReply('❌ An internal error occurred while running this command.');
      } else {
        await interaction.reply({ content: '❌ An internal error occurred.', ephemeral: true });
      }
    }
  }

  /* -------- MODALS -------- */
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'announcement_modal') {
      await interaction.deferReply({ ephemeral: true });

      const title = interaction.fields.getTextInputValue('ann_title');
      const badge = interaction.fields.getTextInputValue('ann_badge').toUpperCase();
      const body = interaction.fields.getTextInputValue('ann_body');

      try {
        await db.execute(
          `INSERT INTO announcements (title, body, badge, status, created_by, created_at) VALUES (?, ?, ?, 'LIVE', (SELECT id FROM users WHERE discord_id=?), NOW())`,
          [title, body, badge, interaction.user.id]
        );

        const channel = interaction.guild.channels.cache.get(process.env.NEWS_CHANNEL_ID);
        if (channel) {
          const embed = new EmbedBuilder().setTitle(`[${badge}] ${title}`).setDescription(body).setColor('#3498db').setTimestamp();
          await channel.send({ embeds: [embed] });
        }
        await interaction.editReply('✅ Announcement published!');
      } catch (err) {
        await interaction.editReply('❌ Failed to publish announcement.');
      }
    }

    // IMPOSTER GAME SETUP MODAL
    if (interaction.customId === 'imp_modal') {
      await interaction.deferReply();
      const genQ = interaction.fields.getTextInputValue('gen_q');
      const impQ = interaction.fields.getTextInputValue('imp_q');
      const imposRole = interaction.guild.roles.cache.find(r => r.name === 'impos');

      if (!imposRole) return interaction.editReply("❌ The `impos` role does not exist.");

      const players = Array.from(imposRole.members.values());
      const imposter = players[Math.floor(Math.random() * players.length)];
      let failedDMs = [];

      for (const p of players) {
        try {
          if (p.id === imposter.id) {
            const impEmbed = new EmbedBuilder().setColor('#e74c3c').setTitle('🤫 YOU ARE THE IMPOSTER').setDescription(`**Your Question:**\n${impQ}`).setFooter({ text: 'Blend in!' });
            await p.send({ embeds: [impEmbed] });
          } else {
            const genEmbed = new EmbedBuilder().setColor('#2ecc71').setTitle('✅ YOU ARE A CREWMATE').setDescription(`**Your Question:**\n${genQ}`).setFooter({ text: 'Find the liar!' });
            await p.send({ embeds: [genEmbed] });
          }
        } catch (e) { failedDMs.push(p.user.username); }
      }

      activeGames.set(interaction.channelId, {
        gamemaster: interaction.user.id,
        imposter: imposter.id,
        players: players,
        votes: new Map()
      });

      let msg = `✅ **Game Setup Complete!** DMs sent.`;
      if (failedDMs.length > 0) msg += `\n⚠️ *Could not DM: ${failedDMs.join(', ')}*`;
      await interaction.editReply(msg);

      setTimeout(() => interaction.channel.send(`🕵️ <@&${imposRole.id}> Check your DMs and answer the question here!`), 5000);
    }
  }

  /* -------- SELECT MENUS -------- */
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'imp_vote') {
      const game = activeGames.get(interaction.channelId);
      if (!game) return interaction.reply({ content: "❌ No active game.", ephemeral: true });
      if (!game.players.find(p => p.id === interaction.user.id)) return interaction.reply({ content: "❌ You are not playing!", ephemeral: true });

      game.votes.set(interaction.user.id, interaction.values[0]);
      await interaction.reply({ content: `✅ Vote cast! You voted for <@${interaction.values[0]}>.`, ephemeral: true });
    }
  }

  /* -------- BUTTONS -------- */
  if (interaction.isButton()) {
    const parts = interaction.customId.split('_');

    // IMPOSTER GAME BUTTONS
    if (interaction.customId === 'imp_setup') {
      const imposRole = interaction.guild.roles.cache.find(r => r.name === 'impos');
      if (!imposRole || imposRole.members.size === 0) {
        return interaction.reply({ content: '❌ Assign the `impos` role to players first!', ephemeral: true });
      }
      const modal = new ModalBuilder().setCustomId('imp_modal').setTitle('Game Questions Setup');
      const q1 = new TextInputBuilder().setCustomId('gen_q').setLabel('General Question (Crewmates)').setStyle(TextInputStyle.Paragraph).setRequired(true);
      const q2 = new TextInputBuilder().setCustomId('imp_q').setLabel('Imposter Question').setStyle(TextInputStyle.Paragraph).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(q1), new ActionRowBuilder().addComponents(q2));
      await interaction.showModal(modal);
    } 
    
    else if (interaction.customId === 'imp_poll') {
      const game = activeGames.get(interaction.channelId);
      if (!game) return interaction.reply({ content: '❌ Setup the game first.', ephemeral: true });
      if (game.gamemaster !== interaction.user.id) return interaction.reply({ content: '❌ Only the GM can start the poll.', ephemeral: true });

      const safePlayers = game.players.slice(0, 25);
      const options = safePlayers.map(p => ({ label: p.user.username, value: p.id }));
      const menu = new StringSelectMenuBuilder().setCustomId('imp_vote').setPlaceholder('Vote for the Imposter').addOptions(options);
      const revealBtn = new ButtonBuilder().setCustomId('imp_reveal').setLabel('🚨 Reveal Imposter').setStyle(ButtonStyle.Danger);
      
      const embed = new EmbedBuilder().setTitle('🗳️ Time to Vote!').setColor('#f1c40f').setDescription('Who is the imposter? Select a name below.');
      await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu), new ActionRowBuilder().addComponents(revealBtn)] });
    } 
    
    else if (interaction.customId === 'imp_end') {
      await interaction.deferReply();
      const imposRole = interaction.guild.roles.cache.find(r => r.name === 'impos');
      if (!imposRole) return interaction.editReply('❌ Role not found.');
      const mems = Array.from(imposRole.members.values());
      for (const m of mems) { await m.roles.remove(imposRole).catch(() => {}); }
      await interaction.editReply(`🛑 **Game Ended.** Removed role from ${mems.length} players.`);
    } 
    
    else if (interaction.customId === 'imp_lb') {
      await interaction.deferReply();
      try {
        const [tops] = await db.query("SELECT username, imposter_guesses FROM users WHERE imposter_guesses > 0 ORDER BY imposter_guesses DESC LIMIT 10");
        if (tops.length === 0) return interaction.editReply("No one has won a game yet!");
        let txt = '';
        tops.forEach((t, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🔹';
          txt += `${medal} **${t.username}** — ${t.imposter_guesses} Correct Guesses\n`;
        });
        const embed = new EmbedBuilder().setTitle('🕵️ Top Detectives').setDescription(txt).setColor('#3498db');
        await interaction.editReply({ embeds: [embed] });
      } catch (err) { await interaction.editReply('❌ DB Error.'); }
    } 
    
    else if (interaction.customId === 'imp_reveal') {
      const game = activeGames.get(interaction.channelId);
      if (!game) return interaction.reply({ content: '❌ Game over.', ephemeral: true });
      if (game.gamemaster !== interaction.user.id) return interaction.reply({ content: '❌ Only the GM can reveal.', ephemeral: true });

      const winners = [];
      const tally = [];

      game.votes.forEach((votedForId, voterId) => {
        const voter = game.players.find(p => p.id === voterId);
        const votedFor = game.players.find(p => p.id === votedForId);
        tally.push(`• **${voter?.user.username}** voted for **${votedFor?.user.username}**`);
        if (votedForId === game.imposter) winners.push(voterId);
      });

      if (winners.length > 0) {
        const placeholders = winners.map(() => '?').join(',');
        await db.query(`UPDATE users SET imposter_guesses = imposter_guesses + 1 WHERE discord_id IN (${placeholders})`, winners).catch(console.error);
      }

      const revealEmbed = new EmbedBuilder().setTitle('🚨 THE IMPOSTER WAS REVEALED!').setDescription(`The imposter was <@${game.imposter}>!`).setColor('#e74c3c')
        .addFields(
          { name: '🗳️ Votes', value: tally.length > 0 ? tally.join('\n') : 'No votes.' },
          { name: '🏆 Winners (+1 Point)', value: winners.length > 0 ? winners.map(id => `<@${id}>`).join(', ') : 'The Imposter fooled everyone!' }
        );

      await interaction.update({ embeds: [revealEmbed], components: [] });
      activeGames.delete(interaction.channelId);
    }

    // ORIGINAL MARRY/DIVORCE LOGIC
    if (parts[0] === 'marry') {
      const [, action, proposerId, targetId] = parts;
      if (interaction.user.id !== targetId) return interaction.reply({ content: '❌ Not for you.', ephemeral: true });
      if (action === 'reject') return interaction.update({ content: '💔 Rejected.', components: [] });
      if (action === 'accept') {
        try {
          const [[p]] = await db.query(`SELECT id FROM users WHERE discord_id=?`, [proposerId]);
          const [[t]] = await db.query(`SELECT id FROM users WHERE discord_id=?`, [targetId]);
          if (!p || !t) return interaction.update({ content: '❌ User data missing.', components: [] });
          await db.query(`INSERT INTO marriages (user1_id, user2_id) VALUES (?, ?)`, [p.id, t.id]);
          return interaction.update({ content: `💍 <@${proposerId}> ❤️ <@${targetId}>`, components: [] });
        } catch (err) { return interaction.update({ content: '❌ Marriage failed.', components: [] }); }
      }
    }
    if (parts[0] === 'divorce') {
      const [, action, userId] = parts;
      if (interaction.user.id !== userId) return interaction.reply({ content: '❌ Not for you.', ephemeral: true });
      if (action === 'cancel') return interaction.update({ content: '❎ Cancelled.', components: [] });
      if (action === 'confirm') {
        try {
          await db.query(`DELETE m FROM marriages m JOIN users u1 ON u1.id = m.user1_id JOIN users u2 ON u2.id = m.user2_id WHERE u1.discord_id=? OR u2.discord_id=?`, [userId, userId]);
          return interaction.update({ content: '💔 Divorce finalized.', components: [] });
        } catch (err) { return interaction.update({ content: '❌ Divorce failed.', components: [] }); }
      }
    }
  }
});

/* ============================
   6. TEXT COMMANDS & LISTENERS
============================ */
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    try { await ensureUser(message.author); } catch (e) {}

    // A. AFK REMOVAL
    try {
        const [[afkEntry]] = await db.query("SELECT * FROM afk WHERE user_id = (SELECT id FROM users WHERE discord_id = ?)", [message.author.id]);
        if (afkEntry) {
            await db.query("DELETE FROM afk WHERE id = ?", [afkEntry.id]);
            if (message.guild && message.guild.members.me.permissions.has('ManageNicknames') && message.member.manageable) {
                const currentName = message.member.displayName;
                if (currentName.includes(' [AFK]')) {
                    await message.member.setNickname(currentName.replace(' [AFK]', '')).catch(()=>{});
                }
            }
            const welcomeMsg = await message.reply(`👋 Welcome back **${message.author.username}**, I removed your AFK.`);
            setTimeout(() => welcomeMsg.delete().catch(() => {}), 10000); 
        }
    } catch (err) {}

    // B. AFK MENTION
    if (message.mentions.users.size > 0) {
        message.mentions.users.forEach(async (u) => {
            if (u.id === message.author.id) return; 
            try {
                const [[targetAfk]] = await db.query("SELECT reason, created_at FROM afk WHERE user_id = (SELECT id FROM users WHERE discord_id = ?)", [u.id]);
                if (targetAfk) {
                    const timestamp = Math.floor(new Date(targetAfk.created_at).getTime() / 1000);
                    await message.reply({ content: `💤 **${u.username}** is AFK: ${targetAfk.reason} (<t:${timestamp}:R>)`, allowedMentions: { repliedUser: false } });
                }
            } catch (err) {}
        });
    }

    // COMMAND: ,afk
    if (message.content.startsWith(',afk')) {
        const reason = message.content.slice(5).trim() || 'Just chilling';
        try {
            const [[user]] = await db.query("SELECT id FROM users WHERE discord_id = ?", [message.author.id]);
            await db.query(`INSERT INTO afk (user_id, reason, created_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE reason = VALUES(reason), created_at = NOW()`, [user.id, reason]);
            if (message.guild && message.guild.members.me.permissions.has('ManageNicknames') && message.member.manageable && message.author.id !== message.guild.ownerId) {
                let newName = message.member.displayName + ' [AFK]';
                if (newName.length > 32) newName = newName.substring(0, 26) + ' [AFK]';
                await message.member.setNickname(newName).catch(()=>{});
            }
            message.reply(`💤 I set your AFK: **${reason}**`);
        } catch (err) { message.reply("❌ DB Error."); }
        return;
    }

    // COMMAND: !exit
    if (message.content.toLowerCase() === '!exit') {
        if (!message.guild) return;
        if (!message.guild.members.me.permissions.has('KickMembers')) return message.reply("❌ No kick perms.");
        if (!message.member.kickable) return message.reply("❌ I can't kick you.");
        const leaveMessages = [`👋 **${message.author.username}** has left the building.`, `👋 **${message.author.username}** touched grass.`, `👋 **${message.author.username}** yeeted themselves.`];
        try {
            await message.author.send("You used `!exit`. Goodbye! 👋").catch(() => {});
            await message.member.kick("User used !exit command");
            await message.channel.send(leaveMessages[Math.floor(Math.random() * leaveMessages.length)]);
        } catch (err) { message.reply("❌ Failed to kick you."); }
    }

    // COMMAND: !imposter (THE NEW GAME MASTER PANEL)
    if (message.content.toLowerCase() === '!imposter') {
        if (!message.member.permissions.has('ManageGuild')) {
            return message.reply("❌ You need **Manage Server** permissions to be the Gamemaster.");
        }

        const embed = new EmbedBuilder()
            .setTitle('🕵️ Imposter Game Master Panel')
            .setDescription('Welcome to the Imposter Control Panel.\n\n⚙️ **Setup Game:** Types questions and DMs players secretly.\n🗳️ **Start Poll:** Drops the voting menu in chat.\n🛑 **End Game:** Removes the `impos` role from everyone.\n🏆 **Leaderboard:** Shows top detectives.')
            .setColor('#2b2d31');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('imp_setup').setLabel('⚙️ Setup Game').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('imp_poll').setLabel('🗳️ Start Poll').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('imp_end').setLabel('🛑 End Game').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('imp_lb').setLabel('🏆 Leaderboard').setStyle(ButtonStyle.Secondary)
        );

        message.reply({ embeds: [embed], components: [row] });
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
   8. LOGIN
============================ */
client.login(process.env.DISCORD_BOT_TOKEN);
