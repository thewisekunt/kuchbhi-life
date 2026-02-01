require('dotenv').config();

const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

if (!process.env.DISCORD_BOT_TOKEN) {
  throw new Error('❌ DISCORD_BOT_TOKEN missing from .env');
}

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' })
  .setToken(process.env.DISCORD_BOT_TOKEN);

(async () => {
  try {
    console.log('⏳ Registering slash commands...');

    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log('✅ Slash commands registered successfully.');
  } catch (error) {
    console.error('❌ Failed to register commands:', error);
  }
})();
