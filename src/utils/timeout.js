/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     TIMEOUT UTILITY                             ║
 * ║                                                                 ║
 * ║   Add timeout to promises to prevent hanging                   ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

/**
 * Add timeout to a promise
 * @param {Promise} promise - Promise to add timeout to
 * @param {number} ms - Timeout in milliseconds
 * @param {string} errorMessage - Custom error message
 * @returns {Promise} Promise that rejects on timeout
 */
function withTimeout(promise, ms, errorMessage = 'Operation timed out') {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`${errorMessage} (${ms}ms)`));
            }, ms);
        }),
    ]);
}

module.exports = { withTimeout };

