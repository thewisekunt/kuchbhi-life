const { SlashCommandBuilder } = require('discord.js');
const ensureUser = require('../utils/ensureUser');
const { getWebhookForChannel } = require('../utils/webhookManager');
const db = require('../db');

const SAY_AS_COST = 200;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sayas')
    .setDescription('Send a message as another user (₹200)')
    .addUserOption(opt =>
      opt
        .setName('user')
        .setDescription('User to speak as')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt
        .setName('message')
        .setDescription('Message to send')
        .setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('user');
    const message = interaction.options.getString('message');
    const sender = interaction.user;

    // Basic safety
    if (message.includes('@everyone') || message.includes('@here')) {
      return interaction.editReply('❌ Mass mentions are not allowed.');
    }

    await ensureUser(sender);
    await ensureUser(target);

    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      // Lock sender balance
      const [[wallet]] = await conn.query(
        `
        SELECT balance
        FROM economy
        WHERE user_id = (
          SELECT id FROM users WHERE discord_id = ? LIMIT 1
        )
        FOR UPDATE
        `,
        [sender.id]
      );

      if (!wallet || wallet.balance < SAY_AS_COST) {
        await conn.rollback();
        return interaction.editReply(
          `❌ You need **₹${SAY_AS_COST}** to use this feature.`
        );
      }

      // Deduct cost
      await conn.query(
        `
        UPDATE economy
        SET balance = balance - ?
        WHERE user_id = (
          SELECT id FROM users WHERE discord_id = ? LIMIT 1
        )
        `,
        [SAY_AS_COST, sender.id]
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      console.error('SayAs Economy Error:', err);
      return interaction.editReply('❌ Transaction failed.');
    } finally {
      conn.release();
    }

    // Send message via webhook
    try {
      const webhook = await getWebhookForChannel(interaction.channel);

      await webhook.send({
        content: message,
        username: target.username,
        avatarURL: target.displayAvatarURL()
      });

      // Log usage
      await db.execute(
        `
        INSERT INTO activity_log (discord_id, type, metadata, created_at)
        VALUES (?, 'SAY_AS', ?, NOW())
        `,
        [
          target.id,
          JSON.stringify({
            by: sender.id,
            cost: SAY_AS_COST,
            channelId: interaction.channelId,
            content: message
          })
        ]
      );

      return interaction.editReply(
        `✅ Message sent as **${target.username}** (₹${SAY_AS_COST} deducted)`
      );

    } catch (err) {
      console.error('SayAs Webhook Error:', err);
      return interaction.editReply(
        '⚠️ Money deducted, but message failed to send.'
      );
    }
  }
};
