const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roast')
    .setDescription('Edgy Hindi roast (dark satire)')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('Kiski leni hai?')
        .setRequired(true)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('target');

    // Bot self-defense
    if (target.id === interaction.client.user.id) {
      return interaction.editReply(
        'Main bot hoon bhai, tera character arc nahi.'
      );
    }

    // ❗ DO NOT defer here
    // index.js already deferred this interaction

    try {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'google/gemini-2.0-flash-001',
          messages: [
            {
              role: 'system',
              content: `
You are an edgy Indian satirist with dark comedy vibes, similar to Samay Raina.
Style rules:
- Hinglish only
- Short, sharp burns (1–2 lines max)
- Meta, sarcastic, observational
- Clever > abusive
- No slurs, no threats
Burn like a punchline, not a paragraph.
              `.trim()
            },
            {
              role: 'user',
              content: `
Target: ${target.username}
Roast them directly.
Max 35 tokens.
              `.trim()
            }
          ]
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 15_000
        }
      );

      const roastText =
        response?.data?.choices?.[0]?.message?.content?.trim();

      if (!roastText) {
        throw new Error('Empty roast response');
      }

      return interaction.editReply(
        `<@${target.id}> ${roastText}`
      );

    } catch (err) {
      console.error(
        'Roast Command Error:',
        err.response?.data || err.message
      );

      return interaction.editReply(
        'Aaj creativity chhutti pe hai. Kal aana, zyada dard hoga.'
      );
    }
  }
};
