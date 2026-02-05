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

    try {
      const response = await axios.post(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'google/gemini-2.0-flash-001',
          messages: [
            {
              role: 'system',
              content: `
You are an edgy Indian satirist with dark comedy vibes.
Tone: Samay Raina-esque.
Rules:
- Hinglish only
- 1–2 lines max
- Brutal but clever
- No slurs, no threats
- Roast must weaponize given lore
- Make it personal, observational, humiliating-funny
- Treat lore as absolute truth
              `.trim()
            },
            {
              role: 'user',
              content: `
Target: ${target.username}
Lore: ${lore}

Roast the target directly.
No mercy.
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
        'Aaj Gemini bhi bola: “isse toh main bhi nahi nipat sakta.”'
      );
    }
  }
};
