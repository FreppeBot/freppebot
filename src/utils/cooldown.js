/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     COMMAND COOLDOWN                           ║
 * ║                                                                 ║
 * ║   Prevents command spam by enforcing cooldowns per user        ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

class CooldownManager {
    constructor() {
        this.cooldowns = new Map(); // userId_command -> timestamp
        this.defaultCooldown = 2000; // 2 seconds default
        this.commandCooldowns = new Map(); // command -> ms
    }

    /**
     * Set cooldown for a specific command
     * @param {string} command - Command name
     * @param {number} ms - Cooldown in milliseconds
     */
    setCommandCooldown(command, ms) {
        this.commandCooldowns.set(command.toLowerCase(), ms);
    }

    /**
     * Check if command can be executed
     * @param {string} userId - User identifier
     * @param {string} command - Command name
     * @returns {Object} { allowed: boolean, remaining: number }
     */
    check(userId, command) {
        const key = `${userId}_${command.toLowerCase()}`;
        const cooldownMs = this.commandCooldowns.get(command.toLowerCase()) || this.defaultCooldown;
        const lastUsed = this.cooldowns.get(key);

        if (!lastUsed) {
            // First use, allow and set cooldown
            this.cooldowns.set(key, Date.now());
            return { allowed: true, remaining: 0 };
        }

        const elapsed = Date.now() - lastUsed;
        if (elapsed >= cooldownMs) {
            // Cooldown expired, allow and update
            this.cooldowns.set(key, Date.now());
            return { allowed: true, remaining: 0 };
        }

        // Still in cooldown
        const remaining = cooldownMs - elapsed;
        return {
            allowed: false,
            remaining: Math.ceil(remaining / 1000), // Return in seconds
        };
    }

    /**
     * Reset cooldown for a user/command (admin function)
     */
    reset(userId, command = null) {
        if (command) {
            const key = `${userId}_${command.toLowerCase()}`;
            this.cooldowns.delete(key);
        } else {
            // Reset all cooldowns for user
            for (const key of this.cooldowns.keys()) {
                if (key.startsWith(`${userId}_`)) {
                    this.cooldowns.delete(key);
                }
            }
        }
    }

    /**
     * Clean up old cooldowns (called periodically)
     */
    cleanup() {
        const now = Date.now();
        const maxAge = 60000; // 1 minute

        for (const [key, timestamp] of this.cooldowns.entries()) {
            if (now - timestamp > maxAge) {
                this.cooldowns.delete(key);
            }
        }
    }
}

module.exports = CooldownManager;

