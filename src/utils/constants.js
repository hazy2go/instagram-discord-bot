/**
 * Application-wide constants
 * Centralizes magic numbers and configuration values
 */

// HTTP and Network Configuration
export const HTTP_TIMEOUT_MS = 20000; // 20 seconds
export const HTTP_KEEP_ALIVE_MAX_SOCKETS = 50;

// Instagram Fetching Configuration
export const STRATEGY_DELAY_MS = 500; // Delay between fetch strategies
export const FETCH_RETRY_ATTEMPTS = 3;
export const FETCH_RETRY_BASE_DELAY_MS = 1000; // Base delay for exponential backoff
export const FETCH_RETRY_MAX_DELAY_MS = 10000; // Max delay between retries

// Account Monitoring Configuration
export const ACCOUNT_CHECK_DELAY_MIN_MS = 2000; // 2 seconds
export const ACCOUNT_CHECK_DELAY_MAX_MS = 3000; // 3 seconds
export const ACCOUNT_CHECK_CONCURRENCY = 5; // Number of accounts to check in parallel
export const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5; // Consecutive failures before circuit opens
export const CIRCUIT_BREAKER_RESET_TIMEOUT_MS = 1800000; // 30 minutes

// Discord Configuration
export const DISCORD_RETRY_ATTEMPTS = 3;
export const DISCORD_RETRY_BASE_DELAY_MS = 1000;
export const DISCORD_MESSAGE_HISTORY_LIMIT = 4; // Messages to check for duplicates
export const DISCORD_EMBED_MAX_LENGTH = 4096;

// Rate Limiting
export const COMMAND_COOLDOWN_MS = 5000; // 5 seconds between commands per user
export const GLOBAL_COMMAND_COOLDOWN_MS = 1000; // 1 second between any commands

// Database Configuration
export const POST_HISTORY_RETENTION_DAYS = 30;
export const DATABASE_BACKUP_RETENTION_DAYS = 7;
export const DATABASE_BACKUP_INTERVAL_HOURS = 24;

// Logging
export const LOG_ROTATION_MAX_SIZE = 10485760; // 10MB
export const LOG_ROTATION_MAX_FILES = 5;

// Instagram URLs
export const INSTAGRAM_BASE_URL = 'https://www.instagram.com';
export const INSTAGRAM_API_URL = 'https://www.instagram.com/api/v1';
export const INSTAGRAM_WEB_APP_ID = '936619743392459';

// Bibliogram Instances (deprecated but kept as last resort)
export const BIBLIOGRAM_INSTANCES = [
  'https://bibliogram.art',
  'https://bibliogram.snopyta.org',
  'https://bibliogram.pussthecat.org'
];

// Health Check
export const HEALTH_CHECK_PORT = 3000;

// Metrics
export const METRICS_COLLECTION_ENABLED = process.env.METRICS_ENABLED === 'true';
