const db = require('../db');
const ensureUser = require('../utils/ensureUser');

module.exports = (client) => {
  client.on('guildMemberRemove', async (member) => {
    if (member.guild.id !== process.env.GUILD_ID) return;

    try {
      // Ensure user exists even if cache is partial
      if (member.user) {
        await ensureUser(member.user);
      }

      await db.execute(
        `
        UPDATE users
        SET in_server = 0
        WHERE discord_id = ?
        `,
        [member.id]
      );

      console.log(
        `[EVENT] Member Left: ${member.user?.username || member.id}`
      );

    } catch (err) {
      console.error(
        '❌ memberLeave Error:',
        err
      );
    }
  });
};
