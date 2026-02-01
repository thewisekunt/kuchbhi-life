const db = require('../db');

const STARBOARD_THRESHOLD = 5;
const STARBOARD_EMOJIS = ['1467485620531368051','1410899903751782411',]; // Add standard emojis or custom IDs

module.exports = (client) => {
    client.on('messageReactionAdd', async (reaction, user) => {
        if (reaction.partial) {
            try { await reaction.fetch(); } catch (err) { return; }
        }

        const { message, emoji } = reaction;
        
        // CHECK: Match name (standard) OR id (custom)
        const isStarboardEmoji = STARBOARD_EMOJIS.includes(emoji.name) || 
                                 STARBOARD_EMOJIS.includes(emoji.id);

        if (!isStarboardEmoji || message.author.bot) return;

        // COUNT: Sum up all reactions that match your list
        const starCount = message.reactions.cache
            .filter(r => STARBOARD_EMOJIS.includes(r.emoji.name) || STARBOARD_EMOJIS.includes(r.emoji.id))
            .reduce((acc, r) => acc + r.count, 0);

        if (starCount >= STARBOARD_THRESHOLD) {
            const attachment = message.attachments.first()?.url || null;
            
            try {
                // ... (rest of your existing database insert logic)
                await db.execute(`
                    INSERT INTO starboard (message_id, channel_id, user_id, content, attachment_url, star_count, jump_url)
                    VALUES (?, ?, (SELECT id FROM users WHERE discord_id = ?), ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE star_count = VALUES(star_count)
                `, [message.id, message.channelId, message.author.id, message.content, attachment, starCount, message.url]);
            } catch (err) {
                console.error('Starboard Sync Error:', err);
            }
        }
    });
};