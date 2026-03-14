const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('📊 Post an Award Category Poll in this channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild) // Admin only
        .addIntegerOption(option => 
            option.setName('category_id')
                .setDescription('The DB ID of the category (Check your Admin Panel)')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply({ flags: 64 }); // Hidden reply for the admin
        const categoryId = interaction.options.getInteger('category_id');

        try {
            // 1. Fetch Category (Bulletproof array extraction)
            const [catRows] = await db.query('SELECT * FROM award_categories WHERE id = ?', [categoryId]);
            const category = catRows[0];
            
            if (!category) {
                return interaction.editReply(`❌ Category with ID **${categoryId}** not found in the database. Are you sure you typed the right number?`);
            }
            if (!category.is_open) {
                return interaction.editReply('❌ Voting for this category is currently closed. Open it on the website first!');
            }

            // 2. Fetch Nominees
            const [nominees] = await db.query(`
                SELECT n.user_id as internal_id, u.username 
                FROM award_nominees n
                JOIN users u ON n.user_id = u.id
                WHERE n.category_id = ?
            `, [categoryId]);

            if (!nominees || nominees.length === 0) {
                return interaction.editReply('❌ No nominees found for this category. Add them via the website first.');
            }

            // 3. Build the Select Menu (With safe fallbacks for Discord limits)
            const safeNominees = nominees.slice(0, 25);
            const options = safeNominees.map(nom => ({
                label: String(nom.username || 'Unknown User').substring(0, 99), // Discord max is 100 chars
                value: String(nom.internal_id),
                description: `Vote for ${nom.username || 'this user'}`.substring(0, 99)
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`award_poll_${categoryId}`)
                .setPlaceholder('Select your vote...')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            // 4. Build the Embed
            const embed = new EmbedBuilder()
                .setTitle(`🏆 ${category.title}`)
                .setDescription(`${category.description || 'Cast your vote below!'}\n\nSelect a nominee from the dropdown to cast your vote. Your vote is **100% anonymous**!`)
                .setColor('#f1c40f')
                .setFooter({ text: 'Kuch Bhi Official Awards' });

            // 5. Send to Channel and Confirm
            await interaction.channel.send({ embeds: [embed], components: [row] });
            await interaction.editReply('✅ Poll posted successfully!');

        } catch (err) {
            console.error('Poll creation error:', err);
            
            // This will tell you EXACTLY what failed right inside Discord
            await interaction.editReply(`❌ **CRASH REPORT:** \`${err.message}\``);
        }
    }
};
