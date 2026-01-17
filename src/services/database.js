import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createLogger } from '../utils/logger.js';
import {
  validateNonEmptyString,
  validatePositiveInteger
} from '../utils/helpers.js';
import {
  POST_HISTORY_RETENTION_DAYS,
  DATABASE_BACKUP_RETENTION_DAYS,
  DATABASE_BACKUP_INTERVAL_HOURS
} from '../utils/constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger('Database');

/**
 * Database Service
 * Handles all database operations with SQLite
 */
class DatabaseService {
  constructor() {
    // Ensure the data directory exists
    const dataDir = path.join(__dirname, '../../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      logger.info('Created data directory', { dataDir });
    }

    this.dbPath = path.join(dataDir, 'bot.db');
    this.backupDir = path.join(dataDir, 'backups');
    this.db = new Database(this.dbPath);

    logger.info('Database initialized', { dbPath: this.dbPath });

    this.initializeTables();
    this.prepareStatements();
    this.setupBackupSchedule();
  }

  /**
   * Initialize database tables
   */
  initializeTables() {
    logger.debug('Initializing database tables');

    // Table for tracked Instagram accounts
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS instagram_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        display_name TEXT,
        last_post_id TEXT,
        last_checked DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        active BOOLEAN DEFAULT 1
      )
    `);

    // Table for notification settings per account
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notification_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instagram_account_id INTEGER NOT NULL,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        custom_message TEXT DEFAULT 'New post from {username}: {url}',
        mention_role_id TEXT,
        active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (instagram_account_id) REFERENCES instagram_accounts(id) ON DELETE CASCADE,
        UNIQUE(instagram_account_id, guild_id, channel_id)
      )
    `);

    // Table for post history (to prevent duplicate notifications)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS post_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instagram_account_id INTEGER NOT NULL,
        post_id TEXT NOT NULL,
        post_url TEXT,
        notified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (instagram_account_id) REFERENCES instagram_accounts(id) ON DELETE CASCADE,
        UNIQUE(instagram_account_id, post_id)
      )
    `);

    // Create indexes for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_ig_username ON instagram_accounts(username);
      CREATE INDEX IF NOT EXISTS idx_notif_channel ON notification_settings(channel_id);
      CREATE INDEX IF NOT EXISTS idx_post_history ON post_history(instagram_account_id, post_id);
    `);

    logger.info('Database tables initialized successfully');
  }

  /**
   * Prepare all SQL statements for better performance
   * Statements are prepared once and reused
   */
  prepareStatements() {
    logger.debug('Preparing SQL statements');

    this.statements = {
      // Instagram accounts
      addAccount: this.db.prepare(`
        INSERT INTO instagram_accounts (username, display_name)
        VALUES (?, ?)
        ON CONFLICT(username) DO UPDATE SET display_name = ?, active = 1
      `),
      getAccount: this.db.prepare('SELECT * FROM instagram_accounts WHERE username = ?'),
      getAllActive: this.db.prepare('SELECT * FROM instagram_accounts WHERE active = 1'),
      updateLastPostId: this.db.prepare(`
        UPDATE instagram_accounts
        SET last_post_id = ?, last_checked = CURRENT_TIMESTAMP
        WHERE id = ?
      `),
      updateLastChecked: this.db.prepare(`
        UPDATE instagram_accounts
        SET last_checked = CURRENT_TIMESTAMP
        WHERE id = ?
      `),
      removeAccount: this.db.prepare('DELETE FROM instagram_accounts WHERE username = ?'),
      deactivateAccount: this.db.prepare('UPDATE instagram_accounts SET active = 0 WHERE username = ?'),

      // Notification settings
      addNotification: this.db.prepare(`
        INSERT INTO notification_settings (instagram_account_id, guild_id, channel_id, custom_message, mention_role_id)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(instagram_account_id, guild_id, channel_id)
        DO UPDATE SET custom_message = ?, mention_role_id = ?, active = 1
      `),
      getNotifications: this.db.prepare(`
        SELECT * FROM notification_settings
        WHERE instagram_account_id = ? AND active = 1
      `),
      getNotificationsForGuild: this.db.prepare(`
        SELECT ns.*, ia.username, ia.display_name
        FROM notification_settings ns
        JOIN instagram_accounts ia ON ns.instagram_account_id = ia.id
        WHERE ns.guild_id = ? AND ns.active = 1
      `),
      removeNotification: this.db.prepare(`
        DELETE FROM notification_settings
        WHERE instagram_account_id = ? AND guild_id = ? AND channel_id = ?
      `),

      // Post history
      addPostHistory: this.db.prepare(`
        INSERT OR IGNORE INTO post_history (instagram_account_id, post_id, post_url)
        VALUES (?, ?, ?)
      `),
      hasPost: this.db.prepare(`
        SELECT COUNT(*) as count FROM post_history
        WHERE instagram_account_id = ? AND post_id = ?
      `),
      cleanupHistory: this.db.prepare(`
        DELETE FROM post_history
        WHERE notified_at < datetime('now', '-${POST_HISTORY_RETENTION_DAYS} days')
      `)
    };

    logger.info('SQL statements prepared successfully');
  }

  /**
   * Add Instagram account to tracking
   * @param {string} username - Instagram username
   * @param {string|null} displayName - Display name
   * @returns {Object} Run result
   */
  addInstagramAccount(username, displayName = null) {
    validateNonEmptyString(username, 'Username');

    logger.debug('Adding Instagram account', { username, displayName });

    try {
      const result = this.statements.addAccount.run(username, displayName, displayName);
      logger.info('Instagram account added', { username, displayName, changes: result.changes });
      return result;
    } catch (error) {
      logger.error('Failed to add Instagram account', { username, displayName, error: error.message });
      throw error;
    }
  }

  /**
   * Get Instagram account by username
   * @param {string} username - Instagram username
   * @returns {Object|null} Account object or null
   */
  getInstagramAccount(username) {
    validateNonEmptyString(username, 'Username');

    logger.debug('Getting Instagram account', { username });
    return this.statements.getAccount.get(username);
  }

  /**
   * Get all active Instagram accounts
   * @returns {Array} Array of account objects
   */
  getAllActiveAccounts() {
    logger.debug('Getting all active accounts');
    const accounts = this.statements.getAllActive.all();
    logger.debug(`Found ${accounts.length} active accounts`, { count: accounts.length });
    return accounts;
  }

  /**
   * Update last post ID for an account
   * @param {number} accountId - Account ID
   * @param {string} postId - Post ID
   * @returns {Object} Run result
   */
  updateLastPostId(accountId, postId) {
    validatePositiveInteger(accountId, 'Account ID');
    validateNonEmptyString(postId, 'Post ID');

    logger.debug('Updating last post ID', { accountId, postId });

    try {
      const result = this.statements.updateLastPostId.run(postId, accountId);
      logger.debug('Last post ID updated', { accountId, postId, changes: result.changes });
      return result;
    } catch (error) {
      logger.error('Failed to update last post ID', { accountId, postId, error: error.message });
      throw error;
    }
  }

  /**
   * Update last checked timestamp for an account
   * @param {number} accountId - Account ID
   * @returns {Object} Run result
   */
  updateLastChecked(accountId) {
    validatePositiveInteger(accountId, 'Account ID');

    logger.debug('Updating last checked timestamp', { accountId });
    return this.statements.updateLastChecked.run(accountId);
  }

  /**
   * Remove Instagram account from tracking
   * @param {string} username - Instagram username
   * @returns {Object} Run result
   */
  removeInstagramAccount(username) {
    validateNonEmptyString(username, 'Username');

    logger.info('Removing Instagram account', { username });

    try {
      const result = this.statements.removeAccount.run(username);
      logger.info('Instagram account removed', { username, changes: result.changes });
      return result;
    } catch (error) {
      logger.error('Failed to remove Instagram account', { username, error: error.message });
      throw error;
    }
  }

  /**
   * Deactivate Instagram account (soft delete)
   * @param {string} username - Instagram username
   * @returns {Object} Run result
   */
  deactivateInstagramAccount(username) {
    validateNonEmptyString(username, 'Username');

    logger.info('Deactivating Instagram account', { username });
    return this.statements.deactivateAccount.run(username);
  }

  /**
   * Add notification setting
   * @param {number} instagramAccountId - Instagram account ID
   * @param {string} guildId - Discord guild ID
   * @param {string} channelId - Discord channel ID
   * @param {string|null} customMessage - Custom message template
   * @param {string|null} mentionRoleId - Role ID to mention
   * @returns {Object} Run result
   */
  addNotificationSetting(instagramAccountId, guildId, channelId, customMessage = null, mentionRoleId = null) {
    validatePositiveInteger(instagramAccountId, 'Instagram account ID');
    validateNonEmptyString(guildId, 'Guild ID');
    validateNonEmptyString(channelId, 'Channel ID');

    logger.debug('Adding notification setting', {
      instagramAccountId,
      guildId,
      channelId,
      hasCustomMessage: !!customMessage,
      hasMentionRole: !!mentionRoleId
    });

    try {
      const result = this.statements.addNotification.run(
        instagramAccountId,
        guildId,
        channelId,
        customMessage,
        mentionRoleId,
        customMessage,
        mentionRoleId
      );
      logger.info('Notification setting added', { instagramAccountId, guildId, channelId, changes: result.changes });
      return result;
    } catch (error) {
      logger.error('Failed to add notification setting', {
        instagramAccountId,
        guildId,
        channelId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get notification settings for an Instagram account
   * @param {number} instagramAccountId - Instagram account ID
   * @returns {Array} Array of notification settings
   */
  getNotificationSettings(instagramAccountId) {
    validatePositiveInteger(instagramAccountId, 'Instagram account ID');

    logger.debug('Getting notification settings', { instagramAccountId });
    return this.statements.getNotifications.all(instagramAccountId);
  }

  /**
   * Get all notification settings for a guild
   * @param {string} guildId - Discord guild ID
   * @returns {Array} Array of notification settings with account info
   */
  getAllNotificationSettingsForGuild(guildId) {
    validateNonEmptyString(guildId, 'Guild ID');

    logger.debug('Getting notification settings for guild', { guildId });
    return this.statements.getNotificationsForGuild.all(guildId);
  }

  /**
   * Remove notification setting
   * @param {number} instagramAccountId - Instagram account ID
   * @param {string} guildId - Discord guild ID
   * @param {string} channelId - Discord channel ID
   * @returns {Object} Run result
   */
  removeNotificationSetting(instagramAccountId, guildId, channelId) {
    validatePositiveInteger(instagramAccountId, 'Instagram account ID');
    validateNonEmptyString(guildId, 'Guild ID');
    validateNonEmptyString(channelId, 'Channel ID');

    logger.info('Removing notification setting', { instagramAccountId, guildId, channelId });

    try {
      const result = this.statements.removeNotification.run(instagramAccountId, guildId, channelId);
      logger.info('Notification setting removed', { instagramAccountId, guildId, channelId, changes: result.changes });
      return result;
    } catch (error) {
      logger.error('Failed to remove notification setting', {
        instagramAccountId,
        guildId,
        channelId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Add post to history
   * @param {number} instagramAccountId - Instagram account ID
   * @param {string} postId - Post ID
   * @param {string} postUrl - Post URL
   * @returns {Object} Run result
   */
  addPostToHistory(instagramAccountId, postId, postUrl) {
    validatePositiveInteger(instagramAccountId, 'Instagram account ID');
    validateNonEmptyString(postId, 'Post ID');

    logger.debug('Adding post to history', { instagramAccountId, postId, postUrl });
    return this.statements.addPostHistory.run(instagramAccountId, postId, postUrl);
  }

  /**
   * Check if post has been notified
   * @param {number} instagramAccountId - Instagram account ID
   * @param {string} postId - Post ID
   * @returns {boolean} True if post has been notified
   */
  hasPostBeenNotified(instagramAccountId, postId) {
    validatePositiveInteger(instagramAccountId, 'Instagram account ID');
    validateNonEmptyString(postId, 'Post ID');

    logger.debug('Checking if post has been notified', { instagramAccountId, postId });
    const result = this.statements.hasPost.get(instagramAccountId, postId);
    return result.count > 0;
  }

  /**
   * Cleanup old post history
   * @returns {Object} Run result with number of deleted rows
   */
  cleanupOldHistory() {
    logger.debug(`Cleaning up post history older than ${POST_HISTORY_RETENTION_DAYS} days`);

    try {
      const result = this.statements.cleanupHistory.run();
      if (result.changes > 0) {
        logger.info(`Cleaned up ${result.changes} old post history entries`, { deleted: result.changes });
      }
      return result;
    } catch (error) {
      logger.error('Failed to cleanup old history', { error: error.message });
      throw error;
    }
  }

  /**
   * Create a backup of the database
   * @returns {string|null} Backup file path or null on error
   */
  createBackup() {
    try {
      // Ensure backup directory exists
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
        logger.info('Created backup directory', { backupDir: this.backupDir });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(this.backupDir, `bot_${timestamp}.db`);

      // Use SQLite backup API for safe online backup
      this.db.backup(backupPath);

      logger.info('Database backup created', { backupPath });

      // Cleanup old backups
      this.cleanupOldBackups();

      return backupPath;
    } catch (error) {
      logger.error('Failed to create database backup', { error: error.message });
      return null;
    }
  }

  /**
   * Cleanup old backup files
   */
  cleanupOldBackups() {
    try {
      if (!fs.existsSync(this.backupDir)) {
        return;
      }

      const files = fs.readdirSync(this.backupDir);
      const now = Date.now();
      const maxAge = DATABASE_BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;

      let deletedCount = 0;

      for (const file of files) {
        if (!file.endsWith('.db')) continue;

        const filePath = path.join(this.backupDir, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;

        if (age > maxAge) {
          fs.unlinkSync(filePath);
          deletedCount++;
          logger.debug('Deleted old backup', { file, age: Math.floor(age / (24 * 60 * 60 * 1000)) + ' days' });
        }
      }

      if (deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} old backup file(s)`, { deleted: deletedCount });
      }
    } catch (error) {
      logger.error('Failed to cleanup old backups', { error: error.message });
    }
  }

  /**
   * Setup automated backup schedule
   */
  setupBackupSchedule() {
    // Create initial backup
    this.createBackup();

    // Schedule periodic backups
    const intervalMs = DATABASE_BACKUP_INTERVAL_HOURS * 60 * 60 * 1000;

    this.backupInterval = setInterval(() => {
      logger.info('Running scheduled database backup');
      this.createBackup();
    }, intervalMs);

    logger.info(`Database backup scheduled every ${DATABASE_BACKUP_INTERVAL_HOURS} hours`);
  }

  /**
   * Close database connection
   */
  close() {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
    }

    // Create final backup before closing
    logger.info('Creating final backup before closing database');
    this.createBackup();

    this.db.close();
    logger.info('Database connection closed');
  }
}

export default DatabaseService;
