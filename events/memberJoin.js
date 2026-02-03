const db = require('../db');
const ensureUser = require('../utils/ensureUser');

module.exports = (client) => {
  client.on('guildMemberAdd', async (member) => {
    // Only track the configured guild
    if (member.guild.id !== process.env.GUILD_ID) return;

    try {
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

      console.log(
        `[EVENT] Member Joined: ${member.user.username}`
      );

    } catch (err) {
      console.error(
        '❌ memberJoin Error:',
        err
      );
    }
  });
};
