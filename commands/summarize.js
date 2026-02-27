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
async function summarizeWithOpenRouter(text) {

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://kuchbhi.life",
      "X-Title": "KuchBhi Discord Bot"
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "You are an expert conversation summarizer. Summarize clearly and concisely."
        },
        {
          role: "user",
          content: `Summarize the following Discord conversation:\n\n${text}`
        }
      ],
      temperature: 0.3
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
    .setName('summarize')
    .setDescription('Summarize last X messages in this channel')
    .addIntegerOption(option =>
      option
        .setName('count')
        .setDescription('Number of recent messages to summarize')
        .setRequired(true)
    ),

  async execute(interaction) {

    if (!interaction.guild) {
      return interaction.reply({
        content: '❌ Use this inside a server.',
        ephemeral: true
      });
    }

    if (!OPENROUTER_API_KEY) {
      return interaction.reply({
        content: '❌ OPENROUTER_API_KEY not set.',
        ephemeral: true
      });
    }

    const count = interaction.options.getInteger('count');

    if (count <= 0 || count > MAX_LIMIT) {
      return interaction.reply({
        content: `❌ Choose between 1 and ${MAX_LIMIT}.`,
        ephemeral: true
      });
    }

    await interaction.deferReply();

    try {
      const messages = await fetchMessages(interaction.channel, count);

      if (!messages.length) {
        return interaction.editReply('❌ No messages found.');
      }

      const transcript = buildTranscript(messages, interaction.guild);

      // Safety truncate if huge
      const limitedTranscript = transcript.length > 120000
        ? transcript.slice(-120000)
        : transcript;

      const summary = await summarizeWithOpenRouter(limitedTranscript);

      if (summary.length > 1900) {
        await interaction.editReply(
          summary.slice(0, 1900) + '\n\n... (truncated)'
        );
      } else {
        await interaction.editReply(summary);
      }

    } catch (err) {
      console.error('Summarize error:', err);
      await interaction.editReply('❌ Failed to summarize.');
    }
  }
};
