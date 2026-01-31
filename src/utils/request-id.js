/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     REQUEST ID TRACKING                        ║
 * ║                                                                 ║
 * ║   Generate unique request IDs for tracing                      ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const { randomBytes } = require('crypto');

/**
 * Generate a unique request ID
 * @returns {string} Request ID (8 hex characters)
 */
function generateRequestId() {
    return randomBytes(4).toString('hex');
}

/**
 * Get request ID from context or generate new one
 * @param {Object} context - Context object that may contain requestId
 * @returns {string} Request ID
 */
function getRequestId(context = {}) {
    return context.requestId || generateRequestId();
}

module.exports = {
    generateRequestId,
    getRequestId,
};

