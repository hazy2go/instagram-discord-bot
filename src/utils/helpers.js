/**
 * Utility helper functions
 */

/**
 * Sanitize error objects to prevent sensitive data leakage in logs
 * @param {Error|Object} error - Error object to sanitize
 * @returns {Object} Sanitized error object safe for logging
 */
export function sanitizeError(error) {
  if (!error) return null;

  const sanitized = {
    message: error.message,
    name: error.name,
    stack: error.stack
  };

  // Sanitize axios error responses
  if (error.response) {
    sanitized.response = {
      status: error.response.status,
      statusText: error.response.statusText,
      headers: { ...error.response.headers }
    };

    // Remove sensitive headers
    if (sanitized.response.headers) {
      delete sanitized.response.headers.authorization;
      delete sanitized.response.headers.cookie;
      delete sanitized.response.headers['set-cookie'];
    }
  }

  // Sanitize axios request config
  if (error.config) {
    sanitized.config = {
      method: error.config.method,
      url: error.config.url,
      timeout: error.config.timeout
    };

    // Remove sensitive request headers
    if (error.config.headers) {
      const safeHeaders = { ...error.config.headers };
      delete safeHeaders.authorization;
      delete safeHeaders.cookie;
      sanitized.config.headers = safeHeaders;
    }
  }

  // Include error code if present
  if (error.code) {
    sanitized.code = error.code;
  }

  return sanitized;
}

/**
 * Implement exponential backoff delay
 * @param {number} attempt - Current retry attempt (0-indexed)
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {number} maxDelay - Maximum delay in milliseconds
 * @returns {Promise<void>} Promise that resolves after delay
 */
export async function exponentialBackoff(attempt, baseDelay = 1000, maxDelay = 10000) {
  const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
  const jitter = Math.random() * 0.3 * delay; // Add 0-30% jitter
  const totalDelay = delay + jitter;

  return new Promise(resolve => setTimeout(resolve, totalDelay));
}

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxAttempts - Maximum number of attempts
 * @param {number} baseDelay - Base delay in milliseconds
 * @param {number} maxDelay - Maximum delay in milliseconds
 * @param {Function} shouldRetry - Optional function to determine if error should trigger retry
 * @returns {Promise<any>} Result of the function call
 */
export async function retryWithBackoff(
  fn,
  maxAttempts = 3,
  baseDelay = 1000,
  maxDelay = 10000,
  shouldRetry = () => true
) {
  let lastError;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Check if we should retry this error
      if (!shouldRetry(error)) {
        throw error;
      }

      // Don't wait after the last attempt
      if (attempt < maxAttempts - 1) {
        await exponentialBackoff(attempt, baseDelay, maxDelay);
      }
    }
  }

  throw lastError;
}

/**
 * Validate that required environment variables are present
 * @param {string[]} requiredVars - Array of required environment variable names
 * @throws {Error} If any required variables are missing
 */
export function validateEnvironment(requiredVars) {
  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
}

/**
 * Validate that a string is not empty
 * @param {string} value - Value to validate
 * @param {string} fieldName - Name of the field for error message
 * @throws {Error} If value is empty or not a string
 */
export function validateNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
}

/**
 * Validate that a value is a positive integer
 * @param {any} value - Value to validate
 * @param {string} fieldName - Name of the field for error message
 * @throws {Error} If value is not a positive integer
 */
export function validatePositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
}

/**
 * Delay execution for a specified time
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>} Promise that resolves after delay
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run async operations with concurrency limit
 * @param {Array} items - Items to process
 * @param {Function} fn - Async function to run for each item
 * @param {number} concurrency - Maximum concurrent operations
 * @returns {Promise<Array>} Array of results
 */
export async function promiseAllWithConcurrency(items, fn, concurrency) {
  const results = [];
  const executing = [];

  for (const item of items) {
    const promise = Promise.resolve().then(() => fn(item));
    results.push(promise);

    if (concurrency <= items.length) {
      const executingPromise = promise.then(() => {
        executing.splice(executing.indexOf(executingPromise), 1);
      });
      executing.push(executingPromise);

      if (executing.length >= concurrency) {
        await Promise.race(executing);
      }
    }
  }

  return Promise.all(results);
}

/**
 * Extract Instagram post ID from URL or GUID
 * @param {string} urlOrGuid - Instagram URL or GUID
 * @returns {string|null} Post ID or null if not found
 */
export function extractInstagramPostId(urlOrGuid) {
  if (!urlOrGuid) return null;

  // Extract from URL like: https://www.instagram.com/p/ABC123xyz/ or /reel/ABC123xyz/
  const match = urlOrGuid.match(/\/(p|reel)\/([A-Za-z0-9_-]+)/);
  return match ? match[2] : urlOrGuid;
}
