/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     EXECUTION CONTEXT                          ║
 * ║         Passed to plugins for every command/tool call          ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

class Context {
    constructor({ message, bot, memory, pluginRegistry, isAdmin }) {
        this.message = message;
        this.bot = bot;
        this.memory = memory;
        this.pluginRegistry = pluginRegistry;
        this.isAdmin = isAdmin;
    }

    /**
     * Reply to the current message
     */
    async reply(content) {
        return this.message.reply(content);
    }

    /**
     * Send a typing indicator
     */
    async sendTyping() {
        return this.message.sendTyping();
    }

    /**
     * Get the AI manager for making AI calls from plugins
     */
    getAI() {
        return this.bot.getAI();
    }

    /**
     * Get memory store for persistent storage
     */
    getMemory() {
        return this.memory;
    }

    /**
     * Get raw database access (for advanced plugins)
     */
    getDatabase() {
        return this.bot.getDatabase();
    }

    /**
     * Get bot configuration
     */
    getConfig() {
        return this.bot.getConfig();
    }

    /**
     * Get user ID
     */
    getUserId() {
        return this.message.userId;
    }

    /**
     * Get platform name
     */
    getPlatform() {
        return this.message.platform;
    }

    /**
     * Remember something for later
     */
    async remember(key, value) {
        return this.memory.remember(this.getUserId(), this.getPlatform(), key, value);
    }

    /**
     * Recall something remembered
     */
    async recall(key) {
        return this.memory.recall(this.getUserId(), this.getPlatform(), key);
    }
}

module.exports = Context;
