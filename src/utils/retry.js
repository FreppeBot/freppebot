/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     RETRY UTILITY                              ║
 * ║                                                                 ║
 * ║   Retry failed operations with exponential backoff            ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const logger = require('./logger');

/**
 * Retry a function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.initialDelay - Initial delay in ms (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 10000)
 * @param {number} options.multiplier - Backoff multiplier (default: 2)
 * @param {Function} options.shouldRetry - Function to determine if error should be retried
 * @returns {Promise} Result of the function
 */
async function retry(fn, options = {}) {
    const {
        maxRetries = 3,
        initialDelay = 1000,
        maxDelay = 10000,
        multiplier = 2,
        shouldRetry = (error) => {
            // Retry on network errors, timeouts, and 5xx errors
            if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET' || error.code === 'ENOTFOUND') {
                return true;
            }
            if (error.status >= 500 && error.status < 600) {
                return true;
            }
            // Don't retry 4xx errors (client errors)
            if (error.status >= 400 && error.status < 500) {
                return false;
            }
            // Retry other errors
            return true;
        },
    } = options;

    let lastError;
    let delay = initialDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // Check if we should retry this error
            if (!shouldRetry(error)) {
                throw error;
            }

            // Don't retry on last attempt
            if (attempt === maxRetries) {
                break;
            }

            // Log retry attempt
            logger.warn(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms: ${error.message}`);

            // Wait before retrying
            await sleep(delay);

            // Exponential backoff
            delay = Math.min(delay * multiplier, maxDelay);
        }
    }

    throw lastError;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { retry, sleep };

