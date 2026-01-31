/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     RATE LIMITER                               ║
 * ║                                                                 ║
 * ║   Prevents abuse by limiting requests per user/time period     ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

class RateLimiter {
    constructor(options = {}) {
        this.windowMs = options.windowMs || 60000; // 1 minute default
        this.maxRequests = options.maxRequests || 10; // 10 requests per window
        this.requests = new Map(); // userId -> { count, resetAt }
    }

    /**
     * Check if a request should be allowed
     * @param {string} userId - User identifier
     * @returns {Object} { allowed: boolean, remaining: number, resetAt: Date }
     */
    check(userId) {
        const now = Date.now();
        const userRequests = this.requests.get(userId);

        // Clean up old entries periodically
        if (Math.random() < 0.01) { // 1% chance to clean up
            this.cleanup(now);
        }

        if (!userRequests || now > userRequests.resetAt) {
            // New window or expired, reset
            const resetAt = now + this.windowMs;
            this.requests.set(userId, { count: 1, resetAt });
            return {
                allowed: true,
                remaining: this.maxRequests - 1,
                resetAt: new Date(resetAt),
            };
        }

        // Increment count
        userRequests.count++;

        if (userRequests.count > this.maxRequests) {
            return {
                allowed: false,
                remaining: 0,
                resetAt: new Date(userRequests.resetAt),
            };
        }

        return {
            allowed: true,
            remaining: this.maxRequests - userRequests.count,
            resetAt: new Date(userRequests.resetAt),
        };
    }

    /**
     * Clean up expired entries
     */
    cleanup(now) {
        for (const [userId, data] of this.requests.entries()) {
            if (now > data.resetAt) {
                this.requests.delete(userId);
            }
        }
    }

    /**
     * Reset rate limit for a user (admin function)
     */
    reset(userId) {
        this.requests.delete(userId);
    }

    /**
     * Get current status for a user
     */
    getStatus(userId) {
        const userRequests = this.requests.get(userId);
        if (!userRequests) {
            return {
                count: 0,
                remaining: this.maxRequests,
                resetAt: null,
            };
        }

        const now = Date.now();
        if (now > userRequests.resetAt) {
            return {
                count: 0,
                remaining: this.maxRequests,
                resetAt: new Date(now + this.windowMs),
            };
        }

        return {
            count: userRequests.count,
            remaining: Math.max(0, this.maxRequests - userRequests.count),
            resetAt: new Date(userRequests.resetAt),
        };
    }
}

module.exports = RateLimiter;

