import { REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import { readdir } from 'fs/promises';
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token || !clientId) {
  console.error('ERROR: DISCORD_TOKEN and DISCORD_CLIENT_ID are required in .env file');
  process.exit(1);
}

async function deployCommands() {
  const commands = [];
  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = await readdir(commandsPath);

  // Load all command data
  for (const file of commandFiles) {
    if (!file.endsWith('.js')) continue;

    const filePath = path.join(commandsPath, file);
    const fileUrl = pathToFileURL(filePath).href;
    const command = (await import(fileUrl)).default;

    if ('data' in command) {
      commands.push(command.data.toJSON());
      console.log(`Loaded command: ${command.data.name}`);
    }
  }

  // Construct and prepare an instance of the REST module
  const rest = new REST().setToken(token);

  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    // Deploy commands globally
    const data = await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands },
    );

    console.log(`Successfully reloaded ${data.length} application (/) commands globally.`);
    console.log('\nCommands deployed:');
    data.forEach(cmd => console.log(`  - /${cmd.name}`));

  } catch (error) {
    console.error('Error deploying commands:', error);
    process.exit(1);
  }
}

deployCommands();
