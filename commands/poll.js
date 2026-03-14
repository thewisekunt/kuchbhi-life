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
            // 1. Fetch Category
            const [[category]] = await db.query('SELECT * FROM award_categories WHERE id = ?', [categoryId]);
            
            if (!category) {
                return interaction.editReply('❌ Category not found. Check the ID on your website.');
            }
            if (!category.is_open) {
                return interaction.editReply('❌ Voting for this category is currently closed.');
            }

            // 2. Fetch Nominees
            const [nominees] = await db.query(`
                SELECT n.user_id as internal_id, u.username 
                FROM award_nominees n
                JOIN users u ON n.user_id = u.id
                WHERE n.category_id = ?
            `, [categoryId]);

            if (nominees.length === 0) {
                return interaction.editReply('❌ No nominees found for this category. Add them via the website first.');
            }

            // 3. Build the Select Menu (Max 25 options)
            const safeNominees = nominees.slice(0, 25);
            const options = safeNominees.map(nom => ({
                label: nom.username,
                value: nom.internal_id.toString(), // We pass the internal DB ID to match the web logic
                description: `Vote for ${nom.username}`
            }));

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`award_poll_${categoryId}`)
                .setPlaceholder('Select your vote...')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            // 4. Build the Embed
            const embed = new EmbedBuilder()
                .setTitle(`🏆 ${category.title}`)
                .setDescription(`${category.description}\n\nSelect a nominee from the dropdown below to cast your vote. Your vote is **100% anonymous** and can be changed until voting closes!`)
                .setColor('#f1c40f')
                .setFooter({ text: 'Kuch Bhi Official Awards' });

            // 5. Send to Channel and Confirm
            await interaction.channel.send({ embeds: [embed], components: [row] });
            await interaction.editReply('✅ Poll posted successfully!');

        } catch (err) {
            console.error('Poll creation error:', err);
            await interaction.editReply('❌ Database error while creating the poll.');
        }
    }
};
