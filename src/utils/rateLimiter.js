/**
 * Rate limiter for commands and operations
 * Prevents spam and abuse
 */

class RateLimiter {
  constructor(cooldownMs) {
    this.cooldownMs = cooldownMs;
    this.lastExecution = new Map(); // key -> timestamp
  }

  /**
   * Check if an operation can be executed
   * @param {string} key - Unique key for the operation (e.g., userId, channelId)
   * @returns {boolean} True if operation can proceed
   */
  canExecute(key) {
    const now = Date.now();
    const lastTime = this.lastExecution.get(key);

    if (!lastTime || now - lastTime >= this.cooldownMs) {
      return true;
    }

    return false;
  }

  /**
   * Record execution of an operation
   * @param {string} key - Unique key for the operation
   */
  recordExecution(key) {
    this.lastExecution.set(key, Date.now());
  }

  /**
   * Get remaining cooldown time
   * @param {string} key - Unique key for the operation
   * @returns {number} Remaining cooldown in milliseconds, or 0 if ready
   */
  getRemainingCooldown(key) {
    const now = Date.now();
    const lastTime = this.lastExecution.get(key);

    if (!lastTime) {
      return 0;
    }

    const elapsed = now - lastTime;
    return Math.max(0, this.cooldownMs - elapsed);
  }

  /**
   * Check and record execution atomically
   * @param {string} key - Unique key for the operation
   * @returns {Object} { allowed: boolean, remainingMs: number }
   */
  checkAndRecord(key) {
    if (this.canExecute(key)) {
      this.recordExecution(key);
      return { allowed: true, remainingMs: 0 };
    }

    return {
      allowed: false,
      remainingMs: this.getRemainingCooldown(key)
    };
  }

  /**
   * Clear rate limit for a specific key
   * @param {string} key - Unique key to clear
   */
  clear(key) {
    this.lastExecution.delete(key);
  }

  /**
   * Clear all rate limits
   */
  clearAll() {
    this.lastExecution.clear();
  }

  /**
   * Clean up old entries (older than cooldown period)
   */
  cleanup() {
    const now = Date.now();
    const keysToDelete = [];

    for (const [key, timestamp] of this.lastExecution.entries()) {
      if (now - timestamp > this.cooldownMs * 2) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.lastExecution.delete(key));
  }
}

export default RateLimiter;
