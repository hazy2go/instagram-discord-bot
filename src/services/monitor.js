import cron from 'node-cron';

class MonitorService {
  constructor(instagramService, notificationService, database) {
    this.instagram = instagramService;
    this.notification = notificationService;
    this.db = database;
    this.isRunning = false;
    this.cronJob = null;
    this.checkInterval = parseInt(process.env.CHECK_INTERVAL) || 5;
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
   * Check all active Instagram accounts for new posts
   */
  async checkAllAccounts() {
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
    try {
      console.log(`[Monitor] Checking @${account.username}...`);

      // Fetch latest post
      const latestPost = await this.instagram.getLatestPost(account.username);

      if (!latestPost) {
        console.log(`[Monitor] No posts found for @${account.username}`);
        this.db.updateLastChecked(account.id);
        return;
      }

      // Check if this is a new post
      const isNewPost = this.isNewPost(account, latestPost);

      if (isNewPost) {
        console.log(`[Monitor] New post detected for @${account.username}: ${latestPost.url}`);

        // Check if we've already notified about this post
        const alreadyNotified = this.db.hasPostBeenNotified(account.id, latestPost.id);

        if (!alreadyNotified) {
          // Get notification settings for this account
          const notificationSettings = this.db.getNotificationSettings(account.id);

          if (notificationSettings.length > 0) {
            // Send notifications
            await this.notification.sendNotification(latestPost, account, notificationSettings);

            // Record that we've notified about this post
            this.db.addPostToHistory(account.id, latestPost.id, latestPost.url);

            console.log(`[Monitor] Notifications sent for @${account.username} to ${notificationSettings.length} channel(s)`);
          } else {
            console.log(`[Monitor] No notification settings configured for @${account.username}`);
          }
        } else {
          console.log(`[Monitor] Post ${latestPost.id} already notified, skipping`);
        }

        // Update last post ID
        this.db.updateLastPostId(account.id, latestPost.id);
      } else {
        console.log(`[Monitor] No new posts for @${account.username}`);
        this.db.updateLastChecked(account.id);
      }

    } catch (error) {
      console.error(`[Monitor] Error checking @${account.username}:`, error.message);
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
    return post.id !== account.last_post_id;
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
    return {
      isRunning: this.isRunning,
      checkInterval: this.checkInterval,
      accountsMonitored: accounts.length,
      accounts: accounts.map(acc => ({
        username: acc.username,
        lastChecked: acc.last_checked
      }))
    };
  }
}

export default MonitorService;
