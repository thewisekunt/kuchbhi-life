const db = require('../db');
const ensureUser = require('../utils/ensureUser');

const STARBOARD_THRESHOLD = 5;

// Can be emoji IDs or unicode names
const STARBOARD_EMOJIS = [
  '1467485620531368051',
  '1410899903751782411'
];

module.exports = (client) => {
  client.on('messageReactionAdd', async (reaction, user) => {
    try {
      // Ignore bot reactions
      if (user.bot) return;

      // Handle partials safely
      if (reaction.partial) {
        try {
          await reaction.fetch();
        } catch {
          return;
        }
      }

      const { message, emoji } = reaction;

      if (!message || !message.author || message.author.bot) return;

      const isStarboardEmoji =
        STARBOARD_EMOJIS.includes(emoji.id) ||
        STARBOARD_EMOJIS.includes(emoji.name);

      if (!isStarboardEmoji) return;

      // Ensure message author exists in DB (CRITICAL)
      await ensureUser(message.author);

      // Count total starboard reactions
      const starCount = message.reactions.cache
        .filter(r =>
          STARBOARD_EMOJIS.includes(r.emoji.id) ||
          STARBOARD_EMOJIS.includes(r.emoji.name)
        )
        .reduce((acc, r) => acc + r.count, 0);

      if (starCount < STARBOARD_THRESHOLD) return;

      const attachmentUrl =
        message.attachments.first()?.url || null;

      await db.execute(
        `
        INSERT INTO starboard (
          message_id,
          channel_id,
          user_id,
          content,
          attachment_url,
          star_count,
          jump_url
        )
        VALUES (
          ?,
          ?,
          (SELECT id FROM users WHERE discord_id = ? LIMIT 1),
          ?,
          ?,
          ?,
          ?
        )
        ON DUPLICATE KEY UPDATE
          star_count = VALUES(star_count)
        `,
        [
          message.id,
          message.channelId,
          message.author.id,
          message.content || '',
          attachmentUrl,
          starCount,
          message.url
        ]
      );

    } catch (err) {
      console.error('❌ Starboard Error:', err);
    }
  });
};
