import { Client, Collection, GatewayIntentBits } from 'discord.js';
import { config } from 'dotenv';
import { readdir, mkdir } from 'fs/promises';
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';
import DatabaseService from './services/database.js';
import InstagramService from './services/instagram.js';
import NotificationService from './services/notification.js';
import MonitorService from './services/monitor.js';
import logger from './utils/logger.js';
import { createLogger } from './utils/logger.js';
import { validateEnvironment } from './utils/helpers.js';
import createHealthCheckServer from './utils/healthCheck.js';
import RateLimiter from './utils/rateLimiter.js';
import { COMMAND_COOLDOWN_MS, GLOBAL_COMMAND_COOLDOWN_MS } from './utils/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appLogger = createLogger('App');

// Load environment variables
config();

/**
 * Validate environment configuration
 */
function validateConfig() {
  appLogger.info('Validating environment configuration');

  const requiredVars = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'];

  try {
    validateEnvironment(requiredVars);
    appLogger.info('Environment configuration validated successfully');
  } catch (error) {
    appLogger.error('Environment configuration validation failed', { error: error.message });
    console.error(`ERROR: ${error.message}`);
    console.error('Please check your .env file and ensure all required variables are set.');
    process.exit(1);
  }

  // Log optional configuration
  const optionalConfig = {
    checkInterval: process.env.CHECK_INTERVAL || '5 (default)',
    activeHours: process.env.ACTIVE_HOURS_START && process.env.ACTIVE_HOURS_END
      ? `${process.env.ACTIVE_HOURS_START}:00 - ${process.env.ACTIVE_HOURS_END}:00`
      : 'Not configured',
    timezone: process.env.ACTIVE_HOURS_TIMEZONE || 'Asia/Tokyo (default)',
    debugMode: process.env.DEBUG_MODE === 'true',
    rssBridge: process.env.RSS_BRIDGE_URL || 'https://rss-bridge.org/bridge01 (default)'
  };

  appLogger.info('Configuration loaded', optionalConfig);
}

/**
 * Create required directories
 */
async function createDirectories() {
  const directories = [
    path.join(__dirname, '../data'),
    path.join(__dirname, '../data/logs'),
    path.join(__dirname, '../data/backups')
  ];

  for (const dir of directories) {
    try {
      await mkdir(dir, { recursive: true });
      appLogger.debug('Directory ensured', { dir });
    } catch (error) {
      appLogger.error('Failed to create directory', { dir, error: error.message });
    }
  }
}

/**
 * Initialize bot and services
 */
async function initializeBot() {
  try {
    // Validate configuration
    validateConfig();

    // Create required directories
    await createDirectories();

    // Create Discord client
    appLogger.info('Creating Discord client');
    const client = new Client({
      intents: [GatewayIntentBits.Guilds]
    });

    // Initialize services
    appLogger.info('Initializing services');
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

    // Rate limiters for commands
    const userRateLimiter = new RateLimiter(COMMAND_COOLDOWN_MS);
    const globalRateLimiter = new RateLimiter(GLOBAL_COMMAND_COOLDOWN_MS);

    // Load commands
    await loadCommands(client);

    // Setup event handlers
    setupEventHandlers(client, services, userRateLimiter, globalRateLimiter);

    // Setup health check server
    const healthServer = createHealthCheckServer(() => monitor.getStatus());

    // Login to Discord
    appLogger.info('Logging in to Discord');
    await client.login(process.env.DISCORD_TOKEN);

    // Setup graceful shutdown
    setupGracefulShutdown(client, monitor, database, healthServer);

    appLogger.info('Bot initialized successfully');

  } catch (error) {
    appLogger.error('Failed to initialize bot', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

/**
 * Load commands from commands directory
 * @param {Client} client - Discord client
 */
async function loadCommands(client) {
  appLogger.info('Loading commands');

  const commandsPath = path.join(__dirname, 'commands');
  const commandFiles = await readdir(commandsPath);

  let loadedCount = 0;

  for (const file of commandFiles) {
    if (!file.endsWith('.js')) continue;

    const filePath = path.join(commandsPath, file);
    const fileUrl = pathToFileURL(filePath).href;
    const command = (await import(fileUrl)).default;

    if ('data' in command && 'execute' in command) {
      client.commands.set(command.data.name, command);
      appLogger.info('Command loaded', { name: command.data.name });
      loadedCount++;
    } else {
      appLogger.warn('Invalid command file', {
        file,
        reason: 'Missing data or execute property'
      });
    }
  }

  appLogger.info('Commands loaded', { count: loadedCount });
}

/**
 * Setup Discord event handlers
 * @param {Client} client - Discord client
 * @param {Object} services - Services container
 * @param {RateLimiter} userRateLimiter - User rate limiter
 * @param {RateLimiter} globalRateLimiter - Global rate limiter
 */
function setupEventHandlers(client, services, userRateLimiter, globalRateLimiter) {
  // Handle autocomplete interactions
  client.on('interactionCreate', async interaction => {
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);

      if (!command || !command.autocomplete) {
        return;
      }

      try {
        await command.autocomplete(interaction, services);
      } catch (error) {
        appLogger.error('Autocomplete error', {
          command: interaction.commandName,
          error: error.message
        });
      }
      return;
    }

    // Handle command execution
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
      appLogger.error('Unknown command', { command: interaction.commandName });
      return;
    }

    // Check global rate limit
    const globalCheck = globalRateLimiter.checkAndRecord('global');
    if (!globalCheck.allowed) {
      appLogger.warn('Global rate limit hit', {
        command: interaction.commandName,
        user: interaction.user.tag
      });
      return; // Silently ignore
    }

    // Check user rate limit
    const userCheck = userRateLimiter.checkAndRecord(interaction.user.id);
    if (!userCheck.allowed) {
      const remainingSeconds = Math.ceil(userCheck.remainingMs / 1000);
      appLogger.warn('User rate limit hit', {
        command: interaction.commandName,
        user: interaction.user.tag,
        remainingSeconds
      });

      try {
        await interaction.reply({
          content: `Please wait ${remainingSeconds} more second(s) before using another command.`,
          ephemeral: true
        });
      } catch (error) {
        appLogger.error('Failed to send rate limit message', { error: error.message });
      }
      return;
    }

    // Execute command
    try {
      appLogger.info('Executing command', {
        command: interaction.commandName,
        user: interaction.user.tag,
        guild: interaction.guild?.name || 'DM'
      });

      await command.execute(interaction, services);

      appLogger.info('Command executed successfully', {
        command: interaction.commandName,
        user: interaction.user.tag
      });

    } catch (error) {
      appLogger.error('Command execution error', {
        command: interaction.commandName,
        user: interaction.user.tag,
        error: error.message,
        stack: error.stack
      });

      const errorMessage = {
        content: 'There was an error while executing this command!',
        ephemeral: true
      };

      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorMessage);
        } else {
          await interaction.reply(errorMessage);
        }
      } catch (replyError) {
        appLogger.error('Failed to send error message', { error: replyError.message });
      }
    }
  });

  // Bot ready event
  client.once('ready', () => {
    appLogger.info('Discord client ready', {
      tag: client.user.tag,
      id: client.user.id,
      guilds: client.guilds.cache.size
    });

    // Start monitoring
    services.monitor.start();

    appLogger.info('Bot is ready and running');
  });

  // Error handling
  client.on('error', error => {
    appLogger.error('Discord client error', {
      error: error.message,
      stack: error.stack
    });
  });

  client.on('warn', warning => {
    appLogger.warn('Discord client warning', { warning });
  });
}

/**
 * Setup graceful shutdown handlers
 * @param {Client} client - Discord client
 * @param {MonitorService} monitor - Monitor service
 * @param {DatabaseService} database - Database service
 * @param {Object} healthServer - Health check server
 */
function setupGracefulShutdown(client, monitor, database, healthServer) {
  const shutdown = async (signal) => {
    appLogger.info('Shutdown signal received', { signal });

    try {
      // Stop monitoring
      appLogger.info('Stopping monitor');
      monitor.stop();

      // Close health check server
      if (healthServer) {
        appLogger.info('Closing health check server');
        healthServer.close();
      }

      // Close database
      appLogger.info('Closing database');
      database.close();

      // Destroy Discord client
      appLogger.info('Destroying Discord client');
      await client.destroy();

      appLogger.info('Shutdown completed successfully');
      process.exit(0);

    } catch (error) {
      appLogger.error('Error during shutdown', {
        error: error.message,
        stack: error.stack
      });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Unhandled errors
  process.on('unhandledRejection', (reason, promise) => {
    appLogger.error('Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined
    });
  });

  process.on('uncaughtException', (error) => {
    appLogger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack
    });
    // Exit on uncaught exception
    process.exit(1);
  });
}

// Start the bot
initializeBot();
