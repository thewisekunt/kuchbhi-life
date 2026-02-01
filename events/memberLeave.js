const db = require('../db');

module.exports = (client) => {
  client.on('guildMemberRemove', async (member) => {
    if (member.guild.id !== process.env.GUILD_ID) return;

    await db.execute(`
      UPDATE users
      SET in_server = 0
      WHERE discord_id = ?
    `, [member.id]);
  });
};
