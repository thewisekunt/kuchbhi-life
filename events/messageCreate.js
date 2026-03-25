const { EmbedBuilder } = require('discord.js');
const db = require('../db');
const ensureUser = require('../utils/ensureUser');

// Cooldowns for normal chatting
const messageCooldown = new Map();
const rewardCooldown = new Map();

const MESSAGE_INTERVAL = 30 * 1000; // stats update every 30s
const REWARD_INTERVAL = 60 * 1000;  // economy reward every 60s

// Put the Role ID you want to ping for bumps here
const BUMP_ROLE_ID = '1484208103913160916'; 

// Tracks recently joined users for the Welcome Reward
const recentJoins = new Map(); 
const welcomeRewarded = new Set(); // Prevents farming the same new user

// Helper function to check and deduct balances
async function deductBalance(discordId, amount) {
    const [rows] = await db.execute(
        `SELECT e.balance FROM economy e JOIN users u ON e.user_id = u.id WHERE u.discord_id = ?`,
        [discordId]
    );
    
    if (rows.length === 0 || rows[0].balance < amount) return false;

    await db.execute(
        `UPDATE economy e JOIN users u ON e.user_id = u.id SET e.balance = e.balance - ? WHERE u.discord_id = ?`,
        [amount, discordId]
    );
    return true;
}

// Helper function to add funds
async function addBalance(discordId, amount) {
    await db.execute(
        `UPDATE economy e JOIN users u ON e.user_id = u.id SET e.balance = e.balance + ? WHERE u.discord_id = ?`,
        [amount, discordId]
    );
}

module.exports = (client) => {

  /* ──────────────────────────────
     🎉 SMART TRACK RECENT JOINS
  ────────────────────────────── */
  client.on('guildMemberAdd', (member) => {
      // Store join time and their names for smart text matching
      recentJoins.set(member.id, {
          time: Date.now(),
          username: member.user.username.toLowerCase(),
          globalName: member.user.globalName ? member.user.globalName.toLowerCase() : ''
      });
      
      // Remove them from the map after 10 minutes to save memory
      setTimeout(() => {
          recentJoins.delete(member.id);
      }, 10 * 60 * 1000);
  });

  client.on('messageCreate', async (message) => {
    if (!message.guild) return;

    /* ──────────────────────────────
       🚀 DISBOARD & DISCADIA TRACKERS
    ────────────────────────────── */
    
    // 1. DISBOARD Tracker (2 Hours)
    if (message.author.id === '302050872383242240') {
        if (message.interaction && message.interaction.commandName === 'bump') {
            if (message.embeds.length > 0 && (message.embeds[0].description || '').includes('Bump done')) {
                const bumper = message.interaction.user;
                try {
                    await ensureUser(bumper);
                    await addBalance(bumper.id, 5000);

                    const rewardEmbed = new EmbedBuilder()
                        .setTitle('🚀 Server Bumped!')
                        .setDescription(`Thank you for bumping the server, <@${bumper.id}>!\n\n**₹5,000** has been deposited into your account as a reward.`)
                        .setColor('#2ecc71')
                        .setTimestamp();

                    await message.channel.send({ embeds: [rewardEmbed] });

                    setTimeout(async () => {
                        const pingTarget = BUMP_ROLE_ID ? `<@&${BUMP_ROLE_ID}>` : `<@${bumper.id}>`;
                        const reminderEmbed = new EmbedBuilder()
                            .setTitle('⏰ It is Disboard Bump Time!')
                            .setDescription(`It has been 2 hours since the last bump!\n\n${pingTarget}, please use the \`/bump\` command again to earn another **₹5,000**!`)
                            .setColor('#f1c40f');
                        await message.channel.send({ content: pingTarget, embeds: [reminderEmbed] });
                    }, 2 * 60 * 60 * 1000); 
                } catch (error) { console.error('Disboard Reward Error:', error); }
            }
        }
        return; 
    }

    // 2. DISCADIA Tracker (24 Hours)
    if (message.author.username.toLowerCase().includes('discadia')) {
        // Check both embed description AND standard message content for Discadia's phrase
        const textToCheck = (message.content + ' ' + (message.embeds[0]?.description || '')).toLowerCase();
        
        if (textToCheck.includes('successfully bumped')) {
            // Check interaction first, otherwise fallback to the first mentioned user
            let bumper = message.interaction ? message.interaction.user : null;
            if (!bumper && message.mentions.users.size > 0) bumper = message.mentions.users.first();

            if (bumper) {
                try {
                    await ensureUser(bumper);
                    await addBalance(bumper.id, 7500);

                    const rewardEmbed = new EmbedBuilder()
                        .setTitle('🌌 Discadia Bump Successful!')
                        .setDescription(`Thank you for the Discadia bump, <@${bumper.id}>!\n\n**₹7,500** has been added to your account!`)
                        .setColor('#9b59b6')
                        .setTimestamp();

                    await message.channel.send({ embeds: [rewardEmbed] });

                    // Set the 24-Hour Reminder Timer (86,400,000 ms)
                    setTimeout(async () => {
                        const pingTarget = BUMP_ROLE_ID ? `<@&${BUMP_ROLE_ID}>` : `<@${bumper.id}>`;
                        const reminderEmbed = new EmbedBuilder()
                            .setTitle('⏰ It is Discadia Bump Time!')
                            .setDescription(`It has been 24 hours!\n\n${pingTarget}, please bump on Discadia again to earn another **₹7,500**!`)
                            .setColor('#9b59b6');
                        await message.channel.send({ content: pingTarget, embeds: [reminderEmbed] });
                    }, 24 * 60 * 60 * 1000);
                } catch (error) { console.error('Discadia Reward Error:', error); }
            }
        }
        return;
    }

    // Ignore all other bots
    if (message.author.bot) return;
    if (message.guild.id !== process.env.GUILD_ID) return;

    const userId = message.author.id;
    const now = Date.now();

    try {
      // ✅ Ensure user exists in DB first
      await ensureUser(message.author);

      /* ──────────────────────────────
         🛠️ COMMA (,) COMMANDS
      ────────────────────────────── */
      if (message.content.startsWith(',')) {
          const args = message.content.slice(1).trim().split(/ +/);
          const command = args.shift().toLowerCase();

          // 1. AVATAR COMMANDS (,av)
          if (command === 'av') {
              const target = message.mentions.users.first();
              
              if (target) {
                  // av user (Rs 5000)
                  const success = await deductBalance(userId, 5000);
                  if (!success) return message.reply("❌ You need **₹5,000** to view someone else's avatar!");
                  
                  return message.channel.send({ content: `**${target.username}'s Avatar** (Paid ₹5,000)`, files: [target.displayAvatarURL({ dynamic: true, size: 512 })] });
              } else {
                  // av self (Rs 1000)
                  const success = await deductBalance(userId, 1000);
                  if (!success) return message.reply("❌ You need **₹1,000** to view your own avatar!");
                  
                  return message.channel.send({ content: `**Your Avatar** (Paid ₹1,000)`, files: [message.author.displayAvatarURL({ dynamic: true, size: 512 })] });
              }
          }

          // 2. NICKNAME COMMANDS (,nickname)
          if (command === 'nickname') {
              const targetMember = message.mentions.members.first();

              if (targetMember) {
                  // nickname user (Rs 50000)
                  const success = await deductBalance(userId, 50000);
                  if (!success) return message.reply("❌ You need **₹50,000** to change someone else's nickname!");

                  // Filter out the mention from the arguments to get the new name
                  const newName = args.filter(arg => !arg.includes('<@')).join(' ');
                  if (!newName) {
                      await addBalance(userId, 50000); // Refund
                      return message.reply("Please provide a new nickname! `,nickname @user NewName`");
                  }

                  try {
                      await targetMember.setNickname(newName);
                      return message.reply(`✅ Successfully changed ${targetMember.user.username}'s nickname to **${newName}**! (Paid ₹50,000)`);
                  } catch (e) {
                      await addBalance(userId, 50000); // Refund if bot lacks permissions
                      return message.reply("❌ I don't have permission to change that user's nickname! (Your ₹50,000 has been refunded)");
                  }

              } else {
                  // nickname self (Rs 10000)
                  const success = await deductBalance(userId, 10000);
                  if (!success) return message.reply("❌ You need **₹10,000** to change your own nickname!");

                  const newName = args.join(' ');
                  if (!newName) {
                      await addBalance(userId, 10000); // Refund
                      return message.reply("Please provide a new nickname! `,nickname NewName`");
                  }

                  try {
                      await message.member.setNickname(newName);
                      return message.reply(`✅ Successfully changed your nickname to **${newName}**! (Paid ₹10,000)`);
                  } catch (e) {
                      await addBalance(userId, 10000); // Refund if bot lacks permissions
                      return message.reply("❌ I don't have permission to change your nickname! (Your ₹10,000 has been refunded)");
                  }
              }
          }
      }

      /* ──────────────────────────────
         🤝 SMART WELCOME REWARD
      ────────────────────────────── */
      const msgLower = message.content.toLowerCase();
      if (msgLower.includes('welcome') || msgLower.includes('welc')) {
          let rewarded = false;
          
          for (const [joinedId, data] of recentJoins.entries()) {
              // If the join was within the last 10 minutes
              if (Date.now() - data.time <= 10 * 60 * 1000) {
                  
                  // Check if greeter mentioned the user OR typed their exact username/global name
                  const isMentioned = message.mentions.has(joinedId);
                  const hasUsername = msgLower.includes(data.username);
                  const hasGlobalName = data.globalName && msgLower.includes(data.globalName);

                  if (isMentioned || hasUsername || hasGlobalName) {
                      const rewardKey = `${userId}-${joinedId}`; // Unique key per greeter-greeted combo
                      
                      if (!welcomeRewarded.has(rewardKey) && userId !== joinedId) {
                          welcomeRewarded.add(rewardKey);
                          rewarded = true;
                      }
                  }
              }
          }

          if (rewarded) {
              await addBalance(userId, 1000);
              // Silently react to confirm the reward was given, instead of spamming chat
              message.react('🤝').catch(() => {});
          }
      }

      /* ──────────────────────────────
         🌟 SYNC DISPLAY NAME & AVATAR
      ────────────────────────────── */
      const serverDisplayName = message.member ? message.member.displayName : (message.author.globalName || message.author.username);
      const currentAvatar = message.author.avatar || '';

      await db.execute(
        `UPDATE users SET username = ?, global_name = ?, avatar = ?, in_server = 1 WHERE discord_id = ?`,
        [message.author.username, serverDisplayName, currentAvatar, userId]
      );

      /* ──────────────────────────────
         🟢 LAST SEEN TRACKING
      ────────────────────────────── */
      await db.execute(
        `INSERT INTO last_seen (discord_id, last_message_at, last_channel_id)
         VALUES (?, NOW(), ?)
         ON DUPLICATE KEY UPDATE last_message_at = NOW(), last_channel_id = VALUES(last_channel_id)`,
        [userId, message.channel.id]
      );

      /* ──────────────────────────────
         1️⃣ MESSAGE COUNT (THROTTLED)
      ────────────────────────────── */
      const lastStat = messageCooldown.get(userId);

      if (!lastStat || now - lastStat > MESSAGE_INTERVAL) {
        await db.execute(
          `INSERT INTO user_stats (user_id, message_count)
           VALUES ((SELECT id FROM users WHERE discord_id = ? LIMIT 1), 1)
           ON DUPLICATE KEY UPDATE message_count = message_count + 1`,
          [userId]
        );
        messageCooldown.set(userId, now);
      }

      /* ──────────────────────────────
         2️⃣ ECONOMY MICRO-REWARD & ACTIVITY
      ────────────────────────────── */
      const lastReward = rewardCooldown.get(userId);

      if (message.content.length >= 8 && (!lastReward || now - lastReward > REWARD_INTERVAL)) {
        const reward = Math.floor(Math.random() * 4) + 2;

        await db.execute(
          `UPDATE economy SET balance = balance + ?, lifetime_earned = lifetime_earned + ?, updated_at = NOW()
           WHERE user_id = (SELECT id FROM users WHERE discord_id = ? LIMIT 1)`,
          [reward, reward, userId]
        );

        await db.execute(
          `INSERT INTO activity_log (user_id, discord_id, type, metadata, created_at)
           VALUES ((SELECT id FROM users WHERE discord_id = ? LIMIT 1), ?, 'EARN', ?, NOW())`,
          [userId, userId, `Earned ₹${reward} for chatting in the server`]
        );

        rewardCooldown.set(userId, now);
      }

    } catch (err) {
      if (err.code === 'ECONNRESET') return;
      console.error('❌ messageCreate DB Error:', err.message);
    }
  });
};
