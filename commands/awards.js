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
.setDescription('Create an award poll')

.addSubcommand(cmd =>
 cmd.setName('create')
 .setDescription('Create award with nominees')
 .addStringOption(o =>
   o.setName('category')
   .setDescription('Award category')
   .setRequired(true))
 .addStringOption(o =>
   o.setName('description')
   .setDescription('Award description')
   .setRequired(true))
 .addStringOption(o =>
   o.setName('nominees')
   .setDescription('Mention nominees separated by comma')
   .setRequired(true))
 .addStringOption(o =>
   o.setName('end_time')
   .setDescription('End time YYYY-MM-DD HH:MM')
   .setRequired(true))
)

.addSubcommand(cmd =>
 cmd.setName('results')
 .setDescription('Show results')
 .addIntegerOption(o =>
   o.setName('category_id')
   .setDescription('Category ID')
   .setRequired(true))
),

async execute(interaction){

const sub = interaction.options.getSubcommand();

/* =========================
   CREATE AWARD + POLL
========================= */

if(sub === "create"){

const category = interaction.options.getString("category");
const description = interaction.options.getString("description");
const nomineesInput = interaction.options.getString("nominees");
const endTimeInput = interaction.options.getString("end_time");

const endTime = new Date(endTimeInput.replace(" ","T")+":00");

if(isNaN(endTime.getTime())){
 return interaction.editReply("❌ Invalid time format. Use YYYY-MM-DD HH:MM");
}

const nominees = nomineesInput.match(/<@!?(\d+)>/g);

if(!nominees || nominees.length < 2){
 return interaction.editReply("❌ Mention at least 2 nominees.");
}

/* CREATE CATEGORY */

const [result] = await db.query(
`INSERT INTO awards_categories (title,description,end_time,created_by)
VALUES (?,?,?,?)`,
[category,description,endTime,interaction.user.id]
);

const categoryId = result.insertId;

/* ADD NOMINEES */

let nomineeRows = [];

for(let mention of nominees){

const id = mention.replace(/[<@!>]/g,'');

const member = await interaction.guild.members.fetch(id);

await db.query(
`INSERT INTO awards_nominees (category_id,discord_id,display_name)
VALUES (?,?,?)`,
[categoryId,id,member.displayName]
);

nomineeRows.push({
id,
name: member.displayName
});

}

/* CREATE EMBED */

const embed = new EmbedBuilder()
.setTitle(`🏆 ${category}`)
.setDescription(
`${description}

🗳 Voting ends <t:${Math.floor(endTime.getTime()/1000)}:R>`
)
.setColor("#FFD700");

/* BUTTONS */

let rows = [];
let row = new ActionRowBuilder();

let nomineeIndex = 0;

for(let nominee of nomineeRows){

row.addComponents(
 new ButtonBuilder()
 .setCustomId(`awardvote_${categoryId}_${nomineeIndex}`)
 .setLabel(nominee.name)
 .setStyle(ButtonStyle.Primary)
);

nomineeIndex++;

if(row.components.length === 5){
 rows.push(row);
 row = new ActionRowBuilder();
}

}

if(row.components.length>0) rows.push(row);

/* POST POLL */

const channel = interaction.guild.channels.cache.get(AWARDS_CHANNEL);

if(!channel){
 return interaction.editReply("❌ Awards channel not configured.");
}

const msg = await channel.send({
embeds:[embed],
components:rows
});

/* SAVE MESSAGE */

await db.query(
`UPDATE awards_categories
SET message_id=?,channel_id=?
WHERE id=?`,
[msg.id,channel.id,categoryId]
);

await interaction.editReply(
`✅ Award created and poll posted in <#${channel.id}>`
);

}

/* =========================
   RESULTS
========================= */

if(sub === "results"){

const categoryId = interaction.options.getInteger("category_id");

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
