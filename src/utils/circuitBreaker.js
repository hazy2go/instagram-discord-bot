/**
 * Circuit Breaker pattern implementation
 * Prevents repeated calls to failing services
 */

class CircuitBreaker {
  constructor(failureThreshold = 5, resetTimeoutMs = 60000) {
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;

    // State per key
    this.failures = new Map(); // key -> count
    this.lastFailureTime = new Map(); // key -> timestamp
    this.state = new Map(); // key -> 'closed' | 'open' | 'half-open'
  }

  /**
   * Check if circuit is open for a given key
   * @param {string} key - Unique key (e.g., username)
   * @returns {boolean} True if circuit is open (blocked)
   */
  isOpen(key) {
    const state = this.state.get(key) || 'closed';

    if (state === 'open') {
      // Check if we should transition to half-open
      const lastFailure = this.lastFailureTime.get(key);
      if (lastFailure && Date.now() - lastFailure >= this.resetTimeoutMs) {
        this.state.set(key, 'half-open');
        return false;
      }
      return true;
    }

    return false;
  }

  /**
   * Record a successful operation
   * @param {string} key - Unique key
   */
  recordSuccess(key) {
    // Reset on success
    this.failures.set(key, 0);
    this.state.set(key, 'closed');
  }

  /**
   * Record a failed operation
   * @param {string} key - Unique key
   * @returns {boolean} True if circuit breaker tripped (opened)
   */
  recordFailure(key) {
    const currentFailures = (this.failures.get(key) || 0) + 1;
    this.failures.set(key, currentFailures);
    this.lastFailureTime.set(key, Date.now());

    const currentState = this.state.get(key) || 'closed';

    // If we're half-open and failed, go back to open
    if (currentState === 'half-open') {
      this.state.set(key, 'open');
      return true;
    }

    // Check if we've hit the threshold
    if (currentFailures >= this.failureThreshold) {
      this.state.set(key, 'open');
      return true;
    }

    return false;
  }

  /**
   * Get current state for a key
   * @param {string} key - Unique key
   * @returns {string} State: 'closed', 'open', or 'half-open'
   */
  getState(key) {
    // Check if open state should transition to half-open
    if (this.isOpen(key)) {
      return 'open';
    }
    return this.state.get(key) || 'closed';
  }

  /**
   * Get failure count for a key
   * @param {string} key - Unique key
   * @returns {number} Number of consecutive failures
   */
  getFailureCount(key) {
    return this.failures.get(key) || 0;
  }

  /**
   * Get remaining time until circuit can be tried again
   * @param {string} key - Unique key
   * @returns {number} Milliseconds until reset, or 0 if closed
   */
  getRemainingResetTime(key) {
    const state = this.getState(key);
    if (state !== 'open') {
      return 0;
    }

    const lastFailure = this.lastFailureTime.get(key);
    if (!lastFailure) {
      return 0;
    }

    const elapsed = Date.now() - lastFailure;
    return Math.max(0, this.resetTimeoutMs - elapsed);
  }

  /**
   * Manually reset circuit for a key
   * @param {string} key - Unique key
   */
  reset(key) {
    this.failures.delete(key);
    this.lastFailureTime.delete(key);
    this.state.delete(key);
  }

  /**
   * Reset all circuits
   */
  resetAll() {
    this.failures.clear();
    this.lastFailureTime.clear();
    this.state.clear();
  }

  /**
   * Get status of all circuits
   * @returns {Array} Array of circuit statuses
   */
  getAllStatuses() {
    const keys = new Set([
      ...this.failures.keys(),
      ...this.state.keys()
    ]);

    return Array.from(keys).map(key => ({
      key,
      state: this.getState(key),
      failures: this.getFailureCount(key),
      remainingResetTime: this.getRemainingResetTime(key)
    }));
  }
}

export default CircuitBreaker;
