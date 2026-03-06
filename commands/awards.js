const {
 SlashCommandBuilder,
 EmbedBuilder,
 ActionRowBuilder,
 ButtonBuilder,
 ButtonStyle
} = require('discord.js');

const db = require('../db');

const AWARDS_CHANNEL = process.env.AWARDS_CHANNEL_ID;

module.exports = {

data: new SlashCommandBuilder()
.setName('awards')
.setDescription('Awards system')

.addSubcommand(cmd =>
 cmd.setName('create')
 .setDescription('Create award category')
 .addStringOption(o =>
   o.setName('title')
   .setDescription('Award title')
   .setRequired(true))
 .addStringOption(o =>
   o.setName('description')
   .setDescription('Description')
   .setRequired(true))
 .addStringOption(o =>
   o.setName('date')
   .setDescription('End date YYYY-MM-DD')
   .setRequired(true))
 .addStringOption(o =>
   o.setName('time')
   .setDescription('End time HH:MM (24h)')
   .setRequired(true))
)

.addSubcommand(cmd =>
 cmd.setName('nominee')
 .setDescription('Add nominee')
 .addIntegerOption(o =>
   o.setName('category')
   .setDescription('Category ID')
   .setRequired(true))
 .addUserOption(o =>
   o.setName('user')
   .setDescription('Nominee')
   .setRequired(true))
)

.addSubcommand(cmd =>
 cmd.setName('publish')
 .setDescription('Publish voting poll')
 .addIntegerOption(o =>
   o.setName('category')
   .setDescription('Category ID')
   .setRequired(true))
)

.addSubcommand(cmd =>
 cmd.setName('results')
 .setDescription('Show results')
 .addIntegerOption(o =>
   o.setName('category')
   .setDescription('Category ID')
   .setRequired(true))
),

async execute(interaction){

const sub = interaction.options.getSubcommand();

/* =========================
   CREATE CATEGORY
========================= */

if(sub === "create"){

const title = interaction.options.getString("title");
const description = interaction.options.getString("description");
const date = interaction.options.getString("date");
const time = interaction.options.getString("time");

const endTime = new Date(`${date}T${time}:00`);

if(isNaN(endTime.getTime())){
 return interaction.editReply("❌ Invalid date/time format.");
}

await db.query(
`INSERT INTO awards_categories (title,description,end_time,created_by)
VALUES (?,?,?,?)`,
[title,description,endTime,interaction.user.id]
);

await interaction.editReply(
`✅ Category created

🏆 **${title}**
Voting ends <t:${Math.floor(endTime.getTime()/1000)}:F>`
);

}


/* =========================
   ADD NOMINEE
========================= */

if(sub === "nominee"){

const category = interaction.options.getInteger("category");
const user = interaction.options.getUser("user");

const member = await interaction.guild.members.fetch(user.id);

await db.query(
`INSERT INTO awards_nominees (category_id,discord_id,display_name)
VALUES (?,?,?)`,
[category,user.id,member.displayName]
);

await interaction.editReply(
`✅ Nominee added

🏆 Category ID: **${category}**
👤 Nominee: **${member.displayName}**`
);

}


/* =========================
   PUBLISH POLL
========================= */

if(sub === "publish"){

const categoryId = interaction.options.getInteger("category");

const [[category]] = await db.query(
`SELECT * FROM awards_categories WHERE id=?`,
[categoryId]
);

if(!category){
 return interaction.editReply("❌ Category not found.");
}

const nominees = await db.query(
`SELECT * FROM awards_nominees WHERE category_id=?`,
[categoryId]
);

if(nominees.length === 0){
 return interaction.editReply("❌ No nominees added.");
}

const embed = new EmbedBuilder()
.setTitle(`🏆 ${category.title}`)
.setDescription(
`${category.description}

🗳 Voting ends <t:${Math.floor(new Date(category.end_time).getTime()/1000)}:R>`
)
.setColor("#FFD700");

let rows = [];
let row = new ActionRowBuilder();

for(let n of nominees){

row.addComponents(
 new ButtonBuilder()
 .setCustomId(`awardvote_${categoryId}_${n.id}`)
 .setLabel(n.display_name)
 .setStyle(ButtonStyle.Primary)
);

if(row.components.length === 5){
 rows.push(row);
 row = new ActionRowBuilder();
}

}

if(row.components.length>0) rows.push(row);

const channel = interaction.guild.channels.cache.get(AWARDS_CHANNEL);

if(!channel){
 return interaction.editReply("❌ Awards channel not configured.");
}

const msg = await channel.send({
 embeds:[embed],
 components:rows
});

await db.query(
`UPDATE awards_categories
SET message_id=?,channel_id=?
WHERE id=?`,
[msg.id,channel.id,categoryId]
);

await interaction.editReply(
`✅ Poll published in <#${channel.id}>`
);

}


/* =========================
   RESULTS
========================= */

if(sub === "results"){

const categoryId = interaction.options.getInteger("category");

const results = await db.query(`
SELECT awards_nominees.display_name,
COUNT(awards_votes.id) votes
FROM awards_nominees
LEFT JOIN awards_votes
ON awards_votes.nominee_id = awards_nominees.id
WHERE awards_nominees.category_id=?
GROUP BY awards_nominees.id
ORDER BY votes DESC
`,[categoryId]);

if(results.length === 0){
 return interaction.editReply("❌ No nominees found.");
}

let text = "";

for(let r of results){
 text += `**${r.display_name}** — ${r.votes} votes\n`;
}

const embed = new EmbedBuilder()
.setTitle("🏆 Award Results")
.setDescription(text)
.setColor("#FFD700");

await interaction.editReply({ embeds:[embed] });

}

}

};
