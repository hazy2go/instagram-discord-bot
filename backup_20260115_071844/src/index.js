import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { config } from 'dotenv';
import { readdir } from 'fs/promises';
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';
import DatabaseService from './services/database.js';
import InstagramService from './services/instagram.js';
import NotificationService from './services/notification.js';
import MonitorService from './services/monitor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
config();

// Validate required environment variables
if (!process.env.DISCORD_TOKEN) {
  console.error('ERROR: DISCORD_TOKEN is required in .env file');
  process.exit(1);
}

if (!process.env.DISCORD_CLIENT_ID) {
  console.error('ERROR: DISCORD_CLIENT_ID is required in .env file');
  process.exit(1);
}

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
  ]
});

// Initialize services
console.log('[Bot] Initializing services...');

const database = new DatabaseService();
const instagram = new InstagramService();
const notification = new NotificationService(client, database);
const monitor = new MonitorService(instagram, notification, database);

// Create commands collection
client.commands = new Collection();

// Service container for dependency injection
const services = {
  database,
  instagram,
  notification,
  monitor
};

// Load commands
async function loadCommands() {
  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = await readdir(commandsPath);

  for (const file of commandFiles) {
    if (!file.endsWith('.js')) continue;

    const filePath = path.join(commandsPath, file);
    const fileUrl = pathToFileURL(filePath).href;
    const command = (await import(fileUrl)).default;

    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      console.log(`[Bot] Loaded command: ${command.data.name}`);
    } else {
      console.warn(`[Bot] Warning: Command at ${file} is missing required "data" or "execute" property`);
    }
  }
}

// Handle slash commands
client.on('interactionCreate', async interaction => {
  // Handle autocomplete
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);

    if (!command || !command.autocomplete) {
      return;
    }

    try {
      await command.autocomplete(interaction, services);
    } catch (error) {
      console.error('[Bot] Autocomplete error:', error);
    }
    return;
  }

  // Handle command execution
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`[Bot] No command matching ${interaction.commandName} was found.`);
    return;
  }

  try {
    await command.execute(interaction, services);
  } catch (error) {
    console.error(`[Bot] Error executing ${interaction.commandName}:`, error);

    const errorMessage = {
      content: 'There was an error while executing this command!',
      ephemeral: true
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

// Bot ready event
client.once('ready', () => {
  console.log(`[Bot] Logged in as ${client.user.tag}`);
  console.log(`[Bot] Serving ${client.guilds.cache.size} server(s)`);

  // Start monitoring
  monitor.start();

  console.log('[Bot] Ready!');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[Bot] Shutting down...');
  monitor.stop();
  database.close();
  await client.destroy();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[Bot] Shutting down...');
  monitor.stop();
  database.close();
  await client.destroy();
  process.exit(0);
});

// Error handling
process.on('unhandledRejection', error => {
  console.error('[Bot] Unhandled promise rejection:', error);
});

// Initialize and start
(async () => {
  try {
    // Create data directory
    const dataDir = path.join(__dirname, '../data');
    await import('fs/promises').then(fs => fs.mkdir(dataDir, { recursive: true }));

    // Load commands
    await loadCommands();

    // Login to Discord
    console.log('[Bot] Logging in to Discord...');
    await client.login(process.env.DISCORD_TOKEN);

  } catch (error) {
    console.error('[Bot] Failed to start:', error);
    process.exit(1);
  }
})();
