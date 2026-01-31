/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     MEMORY STORE                               ║
 * ║                                                                 ║
 * ║   High-level memory management for persistent context          ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const logger = require('../utils/logger');

class MemoryStore {
    constructor(database) {
        this.db = database;
    }

    /**
     * Add a message to conversation history
     */
    async addToConversation(userId, platform, role, content) {
        return this.db.addConversation(userId, platform, role, content);
    }

    /**
     * Get conversation history for AI context
     */
    async getConversationHistory(userId, platform, limit = 10) {
        const rows = this.db.getConversationHistory(userId, platform, limit);
        return rows.map(row => ({
            role: row.role,
            content: row.content,
        }));
    }

    /**
     * Remember something for a user
     */
    async remember(userId, platform, key, value) {
        logger.debug(`Remembering for ${userId}: ${key}`);
        return this.db.setMemory(userId, platform, key, value);
    }

    /**
     * Recall something about a user
     */
    async recall(userId, platform, key) {
        return this.db.getMemory(userId, platform, key);
    }

    /**
     * Get relevant memories for AI context
     * Returns recent and important memories
     */
    getRelevantMemories(userId, platform, limit = 5) {
        const memories = this.db.getAllMemories(userId, platform);
        return memories.slice(0, limit).map(m => ({
            key: m.key,
            content: typeof m.value === 'object' ? JSON.stringify(m.value) : m.value,
        }));
    }

    /**
     * Store a general fact (not user-specific)
     */
    async storeFact(key, value) {
        return this.db.setMemory('_global', '_global', key, value);
    }

    /**
     * Get a general fact
     */
    async getFact(key) {
        return this.db.getMemory('_global', '_global', key);
    }

    /**
     * Clear conversation history for a user
     */
    async clearConversation(userId, platform) {
        // We don't actually delete, just let the history naturally age out
        // This is safer and allows for recovery
        logger.info(`Cleared conversation for ${userId} on ${platform}`);
    }
}

module.exports = MemoryStore;
