const { SlashCommandBuilder } = require('discord.js');
const axios = require('axios');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roast')
        .setDescription('Savage Hindi roast (Samay Raina style)')
        .addUserOption(option => 
            option.setName('target')
                .setDescription('Kiski leni hai?')
                .setRequired(true)),

    async execute(interaction) {
        const target = interaction.options.getUser('target');
        
        // Bot self-defense
        if (target.id === interaction.client.user.id) {
            return interaction.reply("Beta, bot hoon, tera step-dad nahi jo teri har galti (paidaish) ko maaf kar doon. Side hat.");
        }

        await interaction.deferReply();

        try {
            const response = await axios.post(
                "https://openrouter.ai/api/v1/chat/completions",
                {
                    model: "google/gemini-2.0-flash-001", 
                    messages: [
                        {
                            role: "system",
                            content: "You are an edgy, dark-humored Indian comedian like Samay Raina. Your job is to destroy the user with a savage, meta, and non-normie Hindi roast. Use modern slang, dank references, and don't be afraid to be a bit offensive or 'toxic' in a funny way. No 'NASA' or 'school-level' jokes. Keep it concise, sharp, and in Hinglish. Target the user directly."
                        },
                        {
                            role: "user",
                            content: `User: ${target.username}. Roast them like you're on a Samay Raina livestream. Be brutal. Max 50 tokens.`  
                        }
                    ]
                },
                {
                    headers: {
                        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                        "Content-Type": "application/json"
                    }
                }
            );

            const roastText = response.data.choices[0].message.content;

            // Direct text reply, no embed, target mentioned at the start
            await interaction.editReply(`<@${target.id}> ${roastText}`);

        } catch (error) {
            console.error('OpenRouter Error:', error.response ? error.response.data : error.message);
            await interaction.editReply('API ki phat gayi tujhe roast karne mein. Baad mein aa.');
        }
    },
};