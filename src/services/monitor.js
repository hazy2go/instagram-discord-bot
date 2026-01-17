import cron from 'node-cron';
import { createLogger } from '../utils/logger.js';
import { promiseAllWithConcurrency, delay } from '../utils/helpers.js';
import CircuitBreaker from '../utils/circuitBreaker.js';
import metrics from '../utils/metrics.js';
import {
  ACCOUNT_CHECK_DELAY_MIN_MS,
  ACCOUNT_CHECK_DELAY_MAX_MS,
  ACCOUNT_CHECK_CONCURRENCY,
  CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  CIRCUIT_BREAKER_RESET_TIMEOUT_MS
} from '../utils/constants.js';

const logger = createLogger('Monitor');

/**
 * Monitor Service
 * Handles periodic checking of Instagram accounts for new posts
 */
class MonitorService {
  constructor(instagramService, notificationService, database) {
    this.instagram = instagramService;
    this.notification = notificationService;
    this.db = database;
    this.isRunning = false;
    this.cronJob = null;
    this.checkInterval = parseInt(process.env.CHECK_INTERVAL) || 5;
    this.debugMode = process.env.DEBUG_MODE === 'true';

    // Active hours configuration
    this.activeHoursStart = process.env.ACTIVE_HOURS_START ? parseInt(process.env.ACTIVE_HOURS_START) : null;
    this.activeHoursEnd = process.env.ACTIVE_HOURS_END ? parseInt(process.env.ACTIVE_HOURS_END) : null;
    this.activeHoursTimezone = process.env.ACTIVE_HOURS_TIMEZONE || 'Asia/Tokyo';

    // Circuit breaker to prevent repeated failures
    this.circuitBreaker = new CircuitBreaker(
      CIRCUIT_BREAKER_FAILURE_THRESHOLD,
      CIRCUIT_BREAKER_RESET_TIMEOUT_MS
    );

    if (this.activeHoursStart !== null && this.activeHoursEnd !== null) {
      logger.info('Active hours configured', {
        start: this.activeHoursStart,
        end: this.activeHoursEnd,
        timezone: this.activeHoursTimezone
      });
    }

    if (this.debugMode) {
      logger.info('Debug mode enabled - verbose logging active');
    }
  }

  /**
   * Start monitoring all active Instagram accounts
   */
  start() {
    if (this.isRunning) {
      logger.warn('Monitor already running');
      return;
    }

    logger.info('Starting monitor', { checkInterval: this.checkInterval });

    // Run initial check
    this.checkAllAccounts();

    // Schedule periodic checks using cron
    // Convert minutes to cron expression: */5 means every 5 minutes
    const cronExpression = `*/${this.checkInterval} * * * *`;

    this.cronJob = cron.schedule(cronExpression, () => {
      this.checkAllAccounts();
    });

    this.isRunning = true;
    logger.info('Monitor started successfully', {
      cronExpression,
      nextCheck: `${this.checkInterval} minutes`
    });
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
    logger.info('Monitor stopped');
  }

  /**
   * Check if current time is within active hours
   * @returns {boolean} True if within active hours or no active hours configured
   */
  isWithinActiveHours() {
    // If no active hours configured, always return true
    if (this.activeHoursStart === null || this.activeHoursEnd === null) {
      return true;
    }

    try {
      // Get current hour in configured timezone using Intl.DateTimeFormat
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: this.activeHoursTimezone,
        hour: 'numeric',
        hour12: false
      });

      const parts = formatter.formatToParts(new Date());
      const hourPart = parts.find(part => part.type === 'hour');
      const currentHour = parseInt(hourPart.value);

      // Handle overnight time windows (e.g., 21:00 - 05:00)
      if (this.activeHoursStart > this.activeHoursEnd) {
        // Active from start hour to midnight, OR midnight to end hour
        return currentHour >= this.activeHoursStart || currentHour < this.activeHoursEnd;
      } else {
        // Normal time window (e.g., 09:00 - 17:00)
        return currentHour >= this.activeHoursStart && currentHour < this.activeHoursEnd;
      }
    } catch (error) {
      logger.error('Error checking active hours, defaulting to active', {
        error: error.message,
        timezone: this.activeHoursTimezone
      });
      return true; // Default to checking if there's an error
    }
  }

  /**
   * Get current time string in configured timezone
   * @returns {string} Formatted time string
   */
  getCurrentTime() {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: this.activeHoursTimezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      return formatter.format(new Date());
    } catch (error) {
      return new Date().toISOString();
    }
  }

  /**
   * Check all active Instagram accounts for new posts
   * Uses parallel checking with concurrency limit
   */
  async checkAllAccounts() {
    const cycleStartTime = Date.now();

    // Check if we're within active hours
    if (!this.isWithinActiveHours()) {
      const currentTime = this.getCurrentTime();
      logger.info('Outside active hours, skipping check', {
        currentTime,
        timezone: this.activeHoursTimezone,
        activeHours: `${this.activeHoursStart}:00 - ${this.activeHoursEnd}:00`
      });
      return;
    }

    logger.info('Starting account check cycle');

    const accounts = this.db.getAllActiveAccounts();

    if (accounts.length === 0) {
      logger.info('No active accounts to monitor');
      return;
    }

    logger.info(`Checking ${accounts.length} accounts with concurrency ${ACCOUNT_CHECK_CONCURRENCY}`);

    // Check accounts in parallel with concurrency limit
    const results = await promiseAllWithConcurrency(
      accounts,
      async (account) => {
        await this.checkAccount(account);
        // Add random delay between accounts to avoid rate limiting
        const delayMs = ACCOUNT_CHECK_DELAY_MIN_MS +
                       Math.random() * (ACCOUNT_CHECK_DELAY_MAX_MS - ACCOUNT_CHECK_DELAY_MIN_MS);
        await delay(delayMs);
      },
      ACCOUNT_CHECK_CONCURRENCY
    );

    // Cleanup old post history (once per check cycle)
    this.db.cleanupOldHistory();

    const cycleDuration = Date.now() - cycleStartTime;
    logger.info('Check cycle completed', {
      accounts: accounts.length,
      duration: cycleDuration,
      avgPerAccount: Math.round(cycleDuration / accounts.length)
    });
  }

  /**
   * Check a single Instagram account for new posts
   * @param {Object} account - Account object from database
   */
  async checkAccount(account) {
    const startTime = Date.now();

    try {
      // Check circuit breaker
      if (this.circuitBreaker.isOpen(account.username)) {
        const remainingTime = this.circuitBreaker.getRemainingResetTime(account.username);
        logger.warn('Circuit breaker open, skipping account', {
          username: account.username,
          remainingTime: Math.round(remainingTime / 1000) + 's',
          failures: this.circuitBreaker.getFailureCount(account.username)
        });
        return;
      }

      logger.debug('Checking account', {
        username: account.username,
        lastPostId: account.last_post_id || 'none'
      });

      // Fetch latest post
      const latestPost = await this.instagram.getLatestPost(account.username);

      if (!latestPost) {
        logger.warn('No posts found for account', { username: account.username });
        this.db.updateLastChecked(account.id);

        // Record failure for circuit breaker
        const tripped = this.circuitBreaker.recordFailure(account.username);
        if (tripped) {
          logger.error('Circuit breaker tripped for account', {
            username: account.username,
            failures: this.circuitBreaker.getFailureCount(account.username)
          });
          metrics.recordCircuitBreakerTrip(account.username);
        }

        return;
      }

      // Success - reset circuit breaker
      this.circuitBreaker.recordSuccess(account.username);

      if (this.debugMode) {
        logger.debug('Latest post details', {
          username: account.username,
          postId: latestPost.id,
          url: latestPost.url,
          publishedAt: latestPost.publishedAt ? latestPost.publishedAt.toISOString() : 'UNKNOWN'
        });
      }

      // Check if this is a new post
      const isNewPost = this.isNewPost(account, latestPost);

      if (isNewPost) {
        logger.info('NEW POST detected', {
          username: account.username,
          oldPostId: account.last_post_id,
          newPostId: latestPost.id,
          url: latestPost.url,
          publishedAt: latestPost.publishedAt.toISOString()
        });

        metrics.recordPostDetected(account.username);

        // Check if we've already notified about this post (double-check safety)
        const alreadyNotified = this.db.hasPostBeenNotified(account.id, latestPost.id);

        if (!alreadyNotified) {
          // Get notification settings for this account
          const notificationSettings = this.db.getNotificationSettings(account.id);

          if (notificationSettings.length > 0) {
            logger.info('Sending notifications', {
              username: account.username,
              channels: notificationSettings.length
            });

            // Send notifications
            const results = await this.notification.sendNotification(latestPost, account, notificationSettings);

            // Record that we've notified about this post
            this.db.addPostToHistory(account.id, latestPost.id, latestPost.url);

            const successCount = results.filter(r => r.success).length;
            logger.info('Notifications sent', {
              username: account.username,
              successful: successCount,
              total: notificationSettings.length
            });
          } else {
            logger.warn('No notification settings configured for account', { username: account.username });
          }
        } else {
          logger.warn('Post already notified (duplicate detection)', {
            username: account.username,
            postId: latestPost.id
          });
          metrics.recordDuplicateDetected();
        }

        // Update last post ID
        this.db.updateLastPostId(account.id, latestPost.id);
      } else {
        logger.debug('No new posts', {
          username: account.username,
          currentPostId: latestPost.id
        });
        this.db.updateLastChecked(account.id);
      }

      const duration = Date.now() - startTime;
      metrics.recordAccountCheck(duration);

      logger.debug('Account check completed', {
        username: account.username,
        duration
      });

    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Error checking account', {
        username: account.username,
        duration,
        error: error.message,
        stack: error.stack
      });

      metrics.recordError('account_check_error');

      // Record failure for circuit breaker
      const tripped = this.circuitBreaker.recordFailure(account.username);
      if (tripped) {
        logger.error('Circuit breaker tripped for account', {
          username: account.username,
          failures: this.circuitBreaker.getFailureCount(account.username)
        });
        metrics.recordCircuitBreakerTrip(account.username);
      }

      this.db.updateLastChecked(account.id);
    }
  }

  /**
   * Determine if a post is new
   * @param {Object} account - Account object
   * @param {Object} post - Post object
   * @returns {boolean} True if post is new
   */
  isNewPost(account, post) {
    if (this.debugMode) {
      logger.debug('Checking if post is new', {
        username: account.username,
        postId: post.id,
        lastPostId: account.last_post_id,
        publishedAt: post.publishedAt ? post.publishedAt.toISOString() : 'UNKNOWN',
        lastChecked: account.last_checked || 'NEVER'
      });
    }

    // If we don't have a last_post_id, this is the first check
    if (!account.last_post_id) {
      if (this.debugMode) {
        logger.debug('First check for account, not notifying', { username: account.username });
      }
      return false; // Don't notify on first check (avoid spam from old posts)
    }

    // Check if the post ID is different
    if (post.id === account.last_post_id) {
      if (this.debugMode) {
        logger.debug('Same post ID, not new', { username: account.username });
      }
      return false; // Same post, not new
    }

    // Post ID is different, so it might be new
    // Rely on database history and Discord message checks for duplicate prevention
    if (this.debugMode) {
      logger.debug('Different post ID, treating as new', {
        username: account.username,
        newPostId: post.id
      });
    }
    return true;
  }

  /**
   * Force check a specific account (for manual testing)
   * @param {string} username - Instagram username
   */
  async forceCheckAccount(username) {
    logger.info('Force checking account', { username });

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
   * Get monitoring status
   * @returns {Object} Status object with monitoring information
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
        isActive: this.isWithinActiveHours(),
        currentTime: this.getCurrentTime()
      },
      circuitBreakers: this.circuitBreaker.getAllStatuses(),
      accounts: accounts.map(acc => ({
        username: acc.username,
        lastChecked: acc.last_checked,
        lastPostId: acc.last_post_id,
        circuitBreakerState: this.circuitBreaker.getState(acc.username)
      })),
      metrics: metrics.getAllMetrics()
    };
  }

  /**
   * Reset circuit breaker for an account
   * @param {string} username - Instagram username
   */
  resetCircuitBreaker(username) {
    logger.info('Resetting circuit breaker', { username });
    this.circuitBreaker.reset(username);
  }

  /**
   * Reset all circuit breakers
   */
  resetAllCircuitBreakers() {
    logger.info('Resetting all circuit breakers');
    this.circuitBreaker.resetAll();
  }
}

export default MonitorService;
