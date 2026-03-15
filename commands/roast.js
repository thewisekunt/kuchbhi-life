const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');

/**
 * Kuch Bhi Server Lore Database
 * Key should match common usernames / nicknames
 * Keep this exaggerated & fictional
 */
const LORE_MAP = {
  regular: 'OG simp relic, DM reactions pe zinda, joke sunte hi minor-hunter mode on',
  kilojoule: 'coding ke naam pe gyaan, mentorship ke bahane undergrads ko fasane wala',
  jayshah: 'pfp compliment machine, din bhar shawty pe simp, raat bhar DMs',
  pintudi: 'ex ka RR specialist, currently sealed, #RIPPINTUDI',
  yoda: 'gender-neutral simp, BSF arc ka bahana leke flirt karta',
  sarthak: 'har ladki se VC poochta, VC jaake personality reboot hoti',
  trion: 'IQ test ke naam pe VC kidnapping, poora gang operate karta',
  messiah: 'infinite alts, noodles bhejke paise maangta, delete ka professional',
  sexa: 'infinite alts, noodles bhejke paise maangta, delete ka professional',
  wolverine: 'infinite alts, noodles bhejke paise maangta, delete ka professional',
  danish: 'har ladki ke mutuals me, self-shipper, VC me permanent resident',
  deadpool: 'khud ke alts ka parivaar, khud pe hi simp, multiverse unstable',
  yuvvi: 'paragraphs likhne ka predator, podcast ke badle simp',
  dee: 'random VCs + ajeeb tasks, mahila premi aura',
  ankit: 'gaali kha ke bhi peeche padne wala, pain enjoyer',
  shaurya: 'sad stories overshare, sympathy farm, end me simp',
  shawatty: 'jay pe simp, deny karne ka phd',
  desijesus: 'ladki join hote hi auto-pin, divine simp powers',
  vartmaan: 'gaali-proof simp, chugli stats maxed',
  aman: 'sabko di bolke unhi pe simp',
  aditya: 'she/her radar, zinda honi bas condition',
  girlcoder: 'attention = khana, bina attention critical condition',
  cattoratto: 'VC me hi paida hua, duo simp mode',
  cave: 'purane shikar gaye, naye target scan kar raha'
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('roast')
    .setDescription('Lore-based brutal roast (Kuch Bhi Server)')
    .addUserOption(option =>
      option
        .setName('target')
        .setDescription('Kiski leni hai?')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('context')
        .setDescription('Extra context / lore (optional)')
        .setRequired(false)
    ),

  async execute(interaction) {
    // ALWAYS defer the reply for AI commands to prevent the 3-second Discord timeout
    await interaction.deferReply();

    const target = interaction.options.getUser('target');
    const manualContext = interaction.options.getString('context');

    // Bot self-defense
    if (target.id === interaction.client.user.id) {
      return interaction.editReply(
        'Main bot hoon bhai, tera redemption arc nahi.'
      );
    }

    const usernameKey = target.username.toLowerCase();
    const lore =
      LORE_MAP[usernameKey] ||
      manualContext ||
      'No known lore, generic overconfidence, Discord pe zyada time';

    // Injecting a random seed forces the prompt to be slightly different every time
    const randomSeed = Math.floor(Math.random() * 10000);

    try {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'google/gemini-2.0-flash-001',
          temperature: 1.3, // High temperature for maximum creativity and unpredictability
          presence_penalty: 0.6, // Encourages the model to talk about new concepts
          frequency_penalty: 0.6, // Penalizes using the exact same words repeatedly
          messages: [
            {
              role: 'system',
              content: `
You are the most vicious, highly creative, unpredictable Twitter/Discord roaster in 2026.
CRITICAL RULES:
- NEVER repeat the same sentence structure twice. Be wildly varied in your delivery.
- Do NOT rely entirely on cliché slang like "touch grass" or "L+ratio" every single time. Mix it up with dark humor, subtle negging, and surgical personal attacks.
- One sentence outcome. Deathblow. No long para.
- Use current internet culture, but be original. Sound like you’re typing with one hand while laughing at their life choices.
- End with a kill shot / mic drop.
- Never apologize, never soften, never add "no offense".
`.trim()
            },
            {
              role: 'user',
              content: `
Target: ${target.username}
Lore: ${lore}
Randomization Seed: ${randomSeed}

Roast the target directly using their specific lore. Make it completely unique from any previous roast.
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
        'Aaj API bhi bola: “isse toh main bhi nahi nipat sakta.”'
      );
    }
  }
};
