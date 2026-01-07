import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DatabaseService {
  constructor() {
    // Ensure the data directory exists
    const dataDir = path.join(__dirname, '../../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new Database(path.join(dataDir, 'bot.db'));
    this.initializeTables();
  }

  initializeTables() {
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
  }

  // Instagram Account Methods
  addInstagramAccount(username, displayName = null) {
    const stmt = this.db.prepare(`
      INSERT INTO instagram_accounts (username, display_name)
      VALUES (?, ?)
      ON CONFLICT(username) DO UPDATE SET display_name = ?, active = 1
    `);
    return stmt.run(username, displayName, displayName);
  }

  getInstagramAccount(username) {
    const stmt = this.db.prepare('SELECT * FROM instagram_accounts WHERE username = ?');
    return stmt.get(username);
  }

  getAllActiveAccounts() {
    const stmt = this.db.prepare('SELECT * FROM instagram_accounts WHERE active = 1');
    return stmt.all();
  }

  updateLastPostId(accountId, postId) {
    const stmt = this.db.prepare(`
      UPDATE instagram_accounts
      SET last_post_id = ?, last_checked = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    return stmt.run(postId, accountId);
  }

  updateLastChecked(accountId) {
    const stmt = this.db.prepare(`
      UPDATE instagram_accounts
      SET last_checked = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    return stmt.run(accountId);
  }

  removeInstagramAccount(username) {
    const stmt = this.db.prepare('DELETE FROM instagram_accounts WHERE username = ?');
    return stmt.run(username);
  }

  deactivateInstagramAccount(username) {
    const stmt = this.db.prepare('UPDATE instagram_accounts SET active = 0 WHERE username = ?');
    return stmt.run(username);
  }

  // Notification Settings Methods
  addNotificationSetting(instagramAccountId, guildId, channelId, customMessage = null, mentionRoleId = null) {
    const stmt = this.db.prepare(`
      INSERT INTO notification_settings (instagram_account_id, guild_id, channel_id, custom_message, mention_role_id)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(instagram_account_id, guild_id, channel_id)
      DO UPDATE SET custom_message = ?, mention_role_id = ?, active = 1
    `);
    return stmt.run(instagramAccountId, guildId, channelId, customMessage, mentionRoleId, customMessage, mentionRoleId);
  }

  getNotificationSettings(instagramAccountId) {
    const stmt = this.db.prepare(`
      SELECT * FROM notification_settings
      WHERE instagram_account_id = ? AND active = 1
    `);
    return stmt.all(instagramAccountId);
  }

  getAllNotificationSettingsForGuild(guildId) {
    const stmt = this.db.prepare(`
      SELECT ns.*, ia.username, ia.display_name
      FROM notification_settings ns
      JOIN instagram_accounts ia ON ns.instagram_account_id = ia.id
      WHERE ns.guild_id = ? AND ns.active = 1
    `);
    return stmt.all(guildId);
  }

  removeNotificationSetting(instagramAccountId, guildId, channelId) {
    const stmt = this.db.prepare(`
      DELETE FROM notification_settings
      WHERE instagram_account_id = ? AND guild_id = ? AND channel_id = ?
    `);
    return stmt.run(instagramAccountId, guildId, channelId);
  }

  // Post History Methods
  addPostToHistory(instagramAccountId, postId, postUrl) {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO post_history (instagram_account_id, post_id, post_url)
      VALUES (?, ?, ?)
    `);
    return stmt.run(instagramAccountId, postId, postUrl);
  }

  hasPostBeenNotified(instagramAccountId, postId) {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM post_history
      WHERE instagram_account_id = ? AND post_id = ?
    `);
    const result = stmt.get(instagramAccountId, postId);
    return result.count > 0;
  }

  // Cleanup old post history (keep last 30 days)
  cleanupOldHistory() {
    const stmt = this.db.prepare(`
      DELETE FROM post_history
      WHERE notified_at < datetime('now', '-30 days')
    `);
    return stmt.run();
  }

  close() {
    this.db.close();
  }
}

export default DatabaseService;
