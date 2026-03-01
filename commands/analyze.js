const { SlashCommandBuilder } = require('discord.js');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const MODEL = process.env.OPENROUTER_MODEL || "meta-llama/llama-3-70b-instruct";

const MAX_LIMIT = 2000;
const FETCH_BATCH = 100;

/* ============================
   FETCH MESSAGES
============================ */
async function fetchMessages(channel, limit) {
  let allMessages = [];
  let lastId = null;

  while (allMessages.length < limit) {
    const remaining = limit - allMessages.length;
    const batchSize = remaining > FETCH_BATCH ? FETCH_BATCH : remaining;

    const options = { limit: batchSize };
    if (lastId) options.before = lastId;

    const messages = await channel.messages.fetch(options);
    if (!messages.size) break;

    const sorted = [...messages.values()]
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    allMessages.push(...sorted);
    lastId = messages.last().id;
  }

  return allMessages.slice(-limit);
}

/* ============================
   BUILD TRANSCRIPT
============================ */
function buildTranscript(messages, guild) {
  return messages
    .filter(m => !m.author.bot && m.content.trim().length > 0)
    .map(m => {
      const member = guild.members.cache.get(m.author.id);
      const name = member ? member.displayName : m.author.username;
      return `${name}: ${m.content}`;
    })
    .join('\n');
}

/* ============================
   OPENROUTER CALL
============================ */
async function callOpenRouter(systemPrompt, transcript) {

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://kuchbhi.life",
      "X-Title": "KuchBhi Dynamic Analyzer"
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "You are an advanced conversation analysis engine."
        },
        {
          role: "user",
          content: `${systemPrompt}

Here is the conversation:

${transcript}`
        }
      ],
      temperature: 0.4
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(err);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/* ============================
   COMMAND
============================ */
module.exports = {
  data: new SlashCommandBuilder()
    .setName('analyze')
    .setDescription('Apply a custom prompt to recent channel messages')
    .addIntegerOption(option =>
      option
        .setName('count')
        .setDescription('Number of recent messages')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('prompt')
        .setDescription('What do you want to do with the conversation?')
        .setRequired(true)
    ),

  async execute(interaction) {

    if (!interaction.guild) {
      return interaction.reply({
        content: '❌ Use this inside a server.',
        flags: 64
      });
    }

    if (!OPENROUTER_API_KEY) {
      return interaction.reply({
        content: '❌ OPENROUTER_API_KEY not set.',
        flags: 64
      });
    }

    const count = interaction.options.getInteger('count');
    const userPrompt = interaction.options.getString('prompt');

    if (count <= 0 || count > MAX_LIMIT) {
      return interaction.reply({
        content: `❌ Choose between 1 and ${MAX_LIMIT}.`,
        flags: 64
      });
    }

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply();
    }

    try {
      const messages = await fetchMessages(interaction.channel, count);

      if (!messages.length) {
        return interaction.editReply('❌ No messages found.');
      }

      const transcript = buildTranscript(messages, interaction.guild);

      const limitedTranscript = transcript.length > 120000
        ? transcript.slice(-120000)
        : transcript;

      const result = await callOpenRouter(userPrompt, limitedTranscript);

      if (!result) {
        return interaction.editReply('❌ AI returned no response.');
      }

      if (result.length > 1900) {
        await interaction.editReply(
          result.slice(0, 1900) + '\n\n... (truncated)'
        );
      } else {
        await interaction.editReply(result);
      }

    } catch (err) {
      console.error('Analyze error:', err);
      await interaction.editReply('❌ Failed to process request.');
    }
  }
};
