const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('📊 Post an Award Category Poll in this channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addIntegerOption(option => 
            option.setName('category_id')
                .setDescription('The DB ID of the category (Check your Admin Panel)')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply({ flags: 64 });
        const categoryId = interaction.options.getInteger('category_id');

        try {
            const [catRows] = await db.query('SELECT * FROM award_categories WHERE id = ?', [categoryId]);
            const category = catRows[0];
            
            if (!category) return interaction.editReply(`❌ Category with ID **${categoryId}** not found.`);
            if (!category.is_open) return interaction.editReply('❌ Voting for this category is currently closed.');

            // Fetch Nominees + Duo Support + Global Display Names
            const [nominees] = await db.query(`
                SELECT n.user_id as internal_id, 
                       COALESCE(u1.global_name, u1.username) as u1_display,
                       COALESCE(u2.global_name, u2.username) as u2_display
                FROM award_nominees n
                JOIN users u1 ON n.user_id = u1.id
                LEFT JOIN users u2 ON n.user2_id = u2.id
                WHERE n.category_id = ?
            `, [categoryId]);

            if (!nominees || nominees.length === 0) {
                return interaction.editReply('❌ No nominees found for this category.');
            }

            const safeNominees = nominees.slice(0, 25);
            const options = safeNominees.map(nom => {
                // If Duo, combine names. Else, single name.
                const displayName = nom.u2_display 
                    ? `${nom.u1_display} & ${nom.u2_display}` 
                    : nom.u1_display;

                return {
                    label: String(displayName).substring(0, 99),
                    value: String(nom.internal_id),
                    description: `Vote for ${displayName}`.substring(0, 99)
                };
            });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId(`award_poll_${categoryId}`)
                .setPlaceholder('Select your vote...')
                .addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);
            const embed = new EmbedBuilder()
                .setTitle(`🏆 ${category.title}`)
                .setDescription(`${category.description || 'Cast your vote below!'}\n\nSelect a nominee from the dropdown. Your vote is **100% anonymous**!`)
                .setColor('#f1c40f')
                .setFooter({ text: 'Kuch Bhi Official Awards' });

            await interaction.channel.send({ embeds: [embed], components: [row] });
            await interaction.editReply('✅ Poll posted successfully!');

        } catch (err) {
            console.error('Poll creation error:', err);
            await interaction.editReply(`❌ **CRASH REPORT:** \`${err.message}\``);
        }
    }
};
