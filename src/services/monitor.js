import cron from 'node-cron';

class MonitorService {
  constructor(instagramService, notificationService, database) {
    this.instagram = instagramService;
    this.notification = notificationService;
    this.db = database;
    this.isRunning = false;
    this.cronJob = null;
    this.checkInterval = parseInt(process.env.CHECK_INTERVAL) || 5;

    // Active hours configuration
    this.activeHoursStart = process.env.ACTIVE_HOURS_START ? parseInt(process.env.ACTIVE_HOURS_START) : null;
    this.activeHoursEnd = process.env.ACTIVE_HOURS_END ? parseInt(process.env.ACTIVE_HOURS_END) : null;
    this.activeHoursTimezone = process.env.ACTIVE_HOURS_TIMEZONE || 'Asia/Tokyo';

    if (this.activeHoursStart !== null && this.activeHoursEnd !== null) {
      console.log(`[Monitor] Active hours: ${this.activeHoursStart}:00 - ${this.activeHoursEnd}:00 ${this.activeHoursTimezone}`);
    }
  }

  /**
   * Start monitoring all active Instagram accounts
   */
  start() {
    if (this.isRunning) {
      console.log('[Monitor] Already running');
      return;
    }

    console.log(`[Monitor] Starting monitor with ${this.checkInterval} minute interval`);

    // Run initial check
    this.checkAllAccounts();

    // Schedule periodic checks using cron
    // Convert minutes to cron expression: */5 means every 5 minutes
    const cronExpression = `*/${this.checkInterval} * * * *`;

    this.cronJob = cron.schedule(cronExpression, () => {
      this.checkAllAccounts();
    });

    this.isRunning = true;
    console.log('[Monitor] Monitor started successfully');
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    this.isRunning = false;
    console.log('[Monitor] Monitor stopped');
  }

  /**
   * Check if current time is within active hours
   */
  isWithinActiveHours() {
    // If no active hours configured, always return true
    if (this.activeHoursStart === null || this.activeHoursEnd === null) {
      return true;
    }

    try {
      // Get current time in configured timezone
      const now = new Date();
      const currentHour = new Date(now.toLocaleString('en-US', { timeZone: this.activeHoursTimezone })).getHours();

      // Handle overnight time windows (e.g., 21:00 - 05:00)
      if (this.activeHoursStart > this.activeHoursEnd) {
        // Active from start hour to midnight, OR midnight to end hour
        return currentHour >= this.activeHoursStart || currentHour < this.activeHoursEnd;
      } else {
        // Normal time window (e.g., 09:00 - 17:00)
        return currentHour >= this.activeHoursStart && currentHour < this.activeHoursEnd;
      }
    } catch (error) {
      console.error('[Monitor] Error checking active hours:', error.message);
      return true; // Default to checking if there's an error
    }
  }

  /**
   * Check all active Instagram accounts for new posts
   */
  async checkAllAccounts() {
    // Check if we're within active hours
    if (!this.isWithinActiveHours()) {
      const now = new Date();
      const currentTime = now.toLocaleString('en-US', {
        timeZone: this.activeHoursTimezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      console.log(`[Monitor] ⏸️  Outside active hours (current: ${currentTime} ${this.activeHoursTimezone}). Skipping check.`);
      console.log(`[Monitor] Active hours: ${this.activeHoursStart}:00 - ${this.activeHoursEnd}:00 ${this.activeHoursTimezone}`);
      return;
    }

    console.log('[Monitor] Checking all accounts for new posts...');

    const accounts = this.db.getAllActiveAccounts();

    if (accounts.length === 0) {
      console.log('[Monitor] No active accounts to monitor');
      return;
    }

    console.log(`[Monitor] Checking ${accounts.length} accounts`);

    // Check accounts sequentially with delay to avoid rate limiting
    for (const account of accounts) {
      await this.checkAccount(account);

      // Add delay between accounts (2-3 seconds) to avoid rate limiting
      await this.delay(2000 + Math.random() * 1000);
    }

    // Cleanup old post history (once per check cycle)
    this.db.cleanupOldHistory();

    console.log('[Monitor] Check cycle completed');
  }

  /**
   * Check a single Instagram account for new posts
   */
  async checkAccount(account) {
    const startTime = Date.now();

    try {
      console.log(`[Monitor] Checking @${account.username}... (last post: ${account.last_post_id || 'none'})`);

      // Fetch latest post
      const latestPost = await this.instagram.getLatestPost(account.username);

      if (!latestPost) {
        console.log(`[Monitor] ⚠️  No posts found for @${account.username} - account may be private or unreachable`);
        this.db.updateLastChecked(account.id);
        return;
      }

      console.log(`[Monitor] Latest post for @${account.username}: ${latestPost.id} (${latestPost.url})`);

      // Check if this is a new post
      const isNewPost = this.isNewPost(account, latestPost);

      if (isNewPost) {
        console.log(`[Monitor] 🆕 NEW POST detected for @${account.username}!`);
        console.log(`[Monitor]    Old: ${account.last_post_id}`);
        console.log(`[Monitor]    New: ${latestPost.id}`);
        console.log(`[Monitor]    URL: ${latestPost.url}`);
        console.log(`[Monitor]    Published: ${latestPost.publishedAt.toISOString()}`);

        // Check if we've already notified about this post (double-check safety)
        const alreadyNotified = this.db.hasPostBeenNotified(account.id, latestPost.id);

        if (!alreadyNotified) {
          // Get notification settings for this account
          const notificationSettings = this.db.getNotificationSettings(account.id);

          if (notificationSettings.length > 0) {
            console.log(`[Monitor] 📢 Sending notifications to ${notificationSettings.length} channel(s)...`);

            // Send notifications
            const results = await this.notification.sendNotification(latestPost, account, notificationSettings);

            // Record that we've notified about this post
            this.db.addPostToHistory(account.id, latestPost.id, latestPost.url);

            const successCount = results.filter(r => r.success).length;
            console.log(`[Monitor] ✓ Notifications sent: ${successCount}/${notificationSettings.length} successful`);
          } else {
            console.log(`[Monitor] ⚠️  No notification settings configured for @${account.username}`);
          }
        } else {
          console.log(`[Monitor] ⚠️  Post ${latestPost.id} already notified (duplicate detection), skipping`);
        }

        // Update last post ID
        this.db.updateLastPostId(account.id, latestPost.id);
      } else {
        console.log(`[Monitor] ✓ No new posts for @${account.username} (current: ${latestPost.id})`);
        this.db.updateLastChecked(account.id);
      }

      const elapsed = Date.now() - startTime;
      console.log(`[Monitor] Check completed for @${account.username} in ${elapsed}ms`);

    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.error(`[Monitor] ✗ Error checking @${account.username} after ${elapsed}ms:`, error.message);
      console.error(`[Monitor] Stack trace:`, error.stack);
      this.db.updateLastChecked(account.id);
    }
  }

  /**
   * Determine if a post is new
   */
  isNewPost(account, post) {
    // If we don't have a last_post_id, this is the first check
    if (!account.last_post_id) {
      return false; // Don't notify on first check (avoid spam from old posts)
    }

    // Check if the post ID is different
    if (post.id === account.last_post_id) {
      return false; // Same post, not new
    }

    // Additional safety: Check if post was published after last check
    // This prevents reposting old content when Instagram API has issues
    if (account.last_checked && post.publishedAt) {
      const lastChecked = new Date(account.last_checked);
      const postPublished = new Date(post.publishedAt);

      // If post is older than our last check, it's not actually "new"
      // Add 1 minute buffer to account for clock skew
      if (postPublished < new Date(lastChecked.getTime() - 60000)) {
        console.log(`[Monitor] ⚠️  Post ${post.id} is older than last check (published: ${postPublished.toISOString()}, last check: ${lastChecked.toISOString()})`);
        console.log(`[Monitor] ⚠️  Likely an Instagram API issue - skipping to prevent reposting old content`);
        return false;
      }
    }

    return true; // Different post ID and timestamp looks valid
  }

  /**
   * Force check a specific account (for manual testing)
   */
  async forceCheckAccount(username) {
    const account = this.db.getInstagramAccount(username);

    if (!account) {
      throw new Error(`Account @${username} not found in database`);
    }

    // Temporarily clear last_post_id to force notification
    const originalLastPostId = account.last_post_id;
    account.last_post_id = null;

    await this.checkAccount(account);

    // Restore original last_post_id if no new post was found
    const updatedAccount = this.db.getInstagramAccount(username);
    if (!updatedAccount.last_post_id && originalLastPostId) {
      this.db.updateLastPostId(account.id, originalLastPostId);
    }
  }

  /**
   * Utility: Add delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get monitoring status
   */
  getStatus() {
    const accounts = this.db.getAllActiveAccounts();
    const activeHoursEnabled = this.activeHoursStart !== null && this.activeHoursEnd !== null;

    return {
      isRunning: this.isRunning,
      checkInterval: this.checkInterval,
      accountsMonitored: accounts.length,
      activeHours: {
        enabled: activeHoursEnabled,
        start: this.activeHoursStart,
        end: this.activeHoursEnd,
        timezone: this.activeHoursTimezone,
        isActive: this.isWithinActiveHours()
      },
      accounts: accounts.map(acc => ({
        username: acc.username,
        lastChecked: acc.last_checked
      }))
    };
  }
}

export default MonitorService;
