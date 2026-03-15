const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

// Helper function to pause the bot so Discord doesn't ban it for spamming
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dm_awards')
        .setDescription('📢 Mass DM all server members to vote in the awards!')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild), // Only Admins can use this

    async execute(interaction) {
        // We use deferReply so the bot doesn't time out while processing hundreds of users
        await interaction.deferReply({ flags: 64 }); 

        try {
            // 1. Fetch ALL members currently in the Discord server
            const members = await interaction.guild.members.fetch();
            
            // 2. Filter out bots (we only want to DM real humans)
            const humanMembers = members.filter(m => !m.user.bot);
            
            await interaction.editReply(`⏳ Starting Mass DM to **${humanMembers.size}** members...\n\n⚠️ *Please be patient. The bot is sending these slowly (1.5 seconds apart) to avoid getting banned by Discord's anti-spam filters.*`);

            // 3. Create the glamorous Award Embed
            const embed = new EmbedBuilder()
                .setTitle('🏆 The Kuch Bhi Awards are LIVE!')
                .setDescription('Voting is officially open for the Kuch Bhi Awards!\n\nHead over to the website to cast your anonymous votes for the best, funniest, and most unhinged members of the server.\n\n**👉 [Click Here to Vote Now!](https://kuchbhi.life/awards.php)**')
                .setColor('#f1c40f')
                .setThumbnail(interaction.guild.iconURL({ dynamic: true }) || 'https://cdn.discordapp.com/icons/1410172171996631053/0b3a2a757130e279763387fdc04256e6.jpg')
                .setFooter({ text: 'Kuch Bhi Official Awards' });

            let successCount = 0;
            let failCount = 0;

            // 4. Loop through every human and send the DM safely
            for (const [id, member] of humanMembers) {
                try {
                    await member.send({ embeds: [embed] });
                    successCount++;
                } catch (err) {
                    // This catches users who have "Allow Direct Messages from Server Members" turned OFF
                    failCount++;
                }
                
                // CRUCIAL: Sleep for 1.5 seconds before messaging the next person
                await sleep(1500); 
            }

            // 5. Send the final report to the Admin
            await interaction.followUp({ 
                content: `✅ **Mass DM Campaign Complete!**\n\n📩 Successfully sent: **${successCount}**\n❌ Failed (Users with DMs turned off): **${failCount}**`, 
                flags: 64 
            });

        } catch (err) {
            console.error("Mass DM Error:", err);
            await interaction.editReply("❌ A critical error occurred while trying to fetch members or send DMs.");
        }
    }
};
