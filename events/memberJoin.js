const db = require('../db');
const ensureUser = require('../utils/ensureUser');

module.exports = (client) => {
  client.on('guildMemberAdd', async (member) => {
    // Only track the configured guild
    if (member.guild.id !== process.env.GUILD_ID) return;

    try {
      /* ──────────────────────────────
         1️⃣ EXISTING LOGIC (UNCHANGED)
      ────────────────────────────── */

      // Ensure base user + economy row exist
      await ensureUser(member.user);

      // Mark user as present in server
      await db.execute(
        `
        UPDATE users
        SET
          avatar = ?,
          joined_at = NOW(),
          in_server = 1
        WHERE discord_id = ?
        `,
        [
          member.user.avatar || null,
          member.user.id
        ]
      );

      console.log(`[EVENT] Member Joined: ${member.user.username}`);

      /* ──────────────────────────────
         2️⃣ WELCOME SYSTEM (MIMU-STYLE)
      ────────────────────────────── */

      const [[config]] = await db.execute(
        `
        SELECT channel_id, message
        FROM welcome_settings
        WHERE guild_id = ? AND enabled = 1
        `,
        [member.guild.id]
      );

      if (!config) return;

      const channel = member.guild.channels.cache.get(config.channel_id);
      if (!channel) return;

      const welcomeMessage = config.message
        .replace('{user}', `<@${member.id}>`)
        .replace('{username}', member.user.username)
        .replace('{server}', member.guild.name)
        .replace('{count}', member.guild.memberCount);

      await channel.send({ content: welcomeMessage });

    } catch (err) {
      console.error('❌ memberJoin Error:', err);
    }
  });
};
