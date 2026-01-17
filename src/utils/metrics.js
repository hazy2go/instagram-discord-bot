/**
 * Metrics collection service
 * Tracks bot performance and statistics
 */

class MetricsService {
  constructor() {
    this.metrics = {
      // Instagram fetching metrics
      fetchAttempts: new Map(), // username -> count
      fetchSuccesses: new Map(), // username -> count
      fetchFailures: new Map(), // username -> count
      fetchMethodSuccesses: new Map(), // method -> count
      fetchDurations: new Map(), // username -> [durations]

      // Notification metrics
      notificationsSent: 0,
      notificationsFailed: 0,
      notificationsSkipped: 0,

      // Post detection metrics
      postsDetected: new Map(), // username -> count
      duplicatesDetected: 0,

      // Account monitoring metrics
      accountChecks: 0,
      accountCheckDurations: [],

      // Error metrics
      errors: new Map(), // error type -> count

      // Circuit breaker metrics
      circuitBreakerTrips: new Map(), // username -> count

      // Uptime
      startTime: Date.now()
    };
  }

  /**
   * Record Instagram fetch attempt
   * @param {string} username - Instagram username
   */
  recordFetchAttempt(username) {
    this.metrics.fetchAttempts.set(
      username,
      (this.metrics.fetchAttempts.get(username) || 0) + 1
    );
  }

  /**
   * Record successful Instagram fetch
   * @param {string} username - Instagram username
   * @param {string} method - Fetch method used
   * @param {number} duration - Duration in milliseconds
   */
  recordFetchSuccess(username, method, duration) {
    this.metrics.fetchSuccesses.set(
      username,
      (this.metrics.fetchSuccesses.get(username) || 0) + 1
    );

    this.metrics.fetchMethodSuccesses.set(
      method,
      (this.metrics.fetchMethodSuccesses.get(method) || 0) + 1
    );

    if (!this.metrics.fetchDurations.has(username)) {
      this.metrics.fetchDurations.set(username, []);
    }
    this.metrics.fetchDurations.get(username).push(duration);
  }

  /**
   * Record failed Instagram fetch
   * @param {string} username - Instagram username
   */
  recordFetchFailure(username) {
    this.metrics.fetchFailures.set(
      username,
      (this.metrics.fetchFailures.get(username) || 0) + 1
    );
  }

  /**
   * Record notification sent
   */
  recordNotificationSent() {
    this.metrics.notificationsSent++;
  }

  /**
   * Record notification failed
   */
  recordNotificationFailed() {
    this.metrics.notificationsFailed++;
  }

  /**
   * Record notification skipped (duplicate)
   */
  recordNotificationSkipped() {
    this.metrics.notificationsSkipped++;
  }

  /**
   * Record new post detected
   * @param {string} username - Instagram username
   */
  recordPostDetected(username) {
    this.metrics.postsDetected.set(
      username,
      (this.metrics.postsDetected.get(username) || 0) + 1
    );
  }

  /**
   * Record duplicate post detected
   */
  recordDuplicateDetected() {
    this.metrics.duplicatesDetected++;
  }

  /**
   * Record account check
   * @param {number} duration - Duration in milliseconds
   */
  recordAccountCheck(duration) {
    this.metrics.accountChecks++;
    this.metrics.accountCheckDurations.push(duration);

    // Keep only last 100 check durations
    if (this.metrics.accountCheckDurations.length > 100) {
      this.metrics.accountCheckDurations.shift();
    }
  }

  /**
   * Record error
   * @param {string} errorType - Type of error
   */
  recordError(errorType) {
    this.metrics.errors.set(
      errorType,
      (this.metrics.errors.get(errorType) || 0) + 1
    );
  }

  /**
   * Record circuit breaker trip
   * @param {string} username - Instagram username
   */
  recordCircuitBreakerTrip(username) {
    this.metrics.circuitBreakerTrips.set(
      username,
      (this.metrics.circuitBreakerTrips.get(username) || 0) + 1
    );
  }

  /**
   * Get fetch success rate for an account
   * @param {string} username - Instagram username
   * @returns {number} Success rate (0-1)
   */
  getFetchSuccessRate(username) {
    const attempts = this.metrics.fetchAttempts.get(username) || 0;
    const successes = this.metrics.fetchSuccesses.get(username) || 0;
    return attempts > 0 ? successes / attempts : 0;
  }

  /**
   * Get average fetch duration for an account
   * @param {string} username - Instagram username
   * @returns {number} Average duration in milliseconds
   */
  getAverageFetchDuration(username) {
    const durations = this.metrics.fetchDurations.get(username) || [];
    if (durations.length === 0) return 0;
    return durations.reduce((sum, d) => sum + d, 0) / durations.length;
  }

  /**
   * Get average account check duration
   * @returns {number} Average duration in milliseconds
   */
  getAverageCheckDuration() {
    const durations = this.metrics.accountCheckDurations;
    if (durations.length === 0) return 0;
    return durations.reduce((sum, d) => sum + d, 0) / durations.length;
  }

  /**
   * Get uptime in milliseconds
   * @returns {number} Uptime in milliseconds
   */
  getUptime() {
    return Date.now() - this.metrics.startTime;
  }

  /**
   * Get all metrics as JSON-serializable object
   * @returns {Object} All metrics
   */
  getAllMetrics() {
    return {
      uptime: this.getUptime(),
      fetching: {
        totalAttempts: Array.from(this.metrics.fetchAttempts.values()).reduce((sum, v) => sum + v, 0),
        totalSuccesses: Array.from(this.metrics.fetchSuccesses.values()).reduce((sum, v) => sum + v, 0),
        totalFailures: Array.from(this.metrics.fetchFailures.values()).reduce((sum, v) => sum + v, 0),
        methodSuccesses: Object.fromEntries(this.metrics.fetchMethodSuccesses),
        byAccount: Array.from(this.metrics.fetchAttempts.keys()).map(username => ({
          username,
          attempts: this.metrics.fetchAttempts.get(username) || 0,
          successes: this.metrics.fetchSuccesses.get(username) || 0,
          failures: this.metrics.fetchFailures.get(username) || 0,
          successRate: this.getFetchSuccessRate(username),
          avgDuration: this.getAverageFetchDuration(username)
        }))
      },
      notifications: {
        sent: this.metrics.notificationsSent,
        failed: this.metrics.notificationsFailed,
        skipped: this.metrics.notificationsSkipped,
        successRate: this.metrics.notificationsSent + this.metrics.notificationsFailed > 0
          ? this.metrics.notificationsSent / (this.metrics.notificationsSent + this.metrics.notificationsFailed)
          : 0
      },
      posts: {
        detected: Array.from(this.metrics.postsDetected.values()).reduce((sum, v) => sum + v, 0),
        duplicates: this.metrics.duplicatesDetected,
        byAccount: Object.fromEntries(this.metrics.postsDetected)
      },
      monitoring: {
        totalChecks: this.metrics.accountChecks,
        avgCheckDuration: this.getAverageCheckDuration()
      },
      circuitBreaker: {
        trips: Object.fromEntries(this.metrics.circuitBreakerTrips)
      },
      errors: Object.fromEntries(this.metrics.errors)
    };
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics = {
      fetchAttempts: new Map(),
      fetchSuccesses: new Map(),
      fetchFailures: new Map(),
      fetchMethodSuccesses: new Map(),
      fetchDurations: new Map(),
      notificationsSent: 0,
      notificationsFailed: 0,
      notificationsSkipped: 0,
      postsDetected: new Map(),
      duplicatesDetected: 0,
      accountChecks: 0,
      accountCheckDurations: [],
      errors: new Map(),
      circuitBreakerTrips: new Map(),
      startTime: Date.now()
    };
  }
}

// Export singleton instance
export default new MetricsService();
