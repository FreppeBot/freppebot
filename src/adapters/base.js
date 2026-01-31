/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     BASE ADAPTER                               ║
 * ║                                                                 ║
 * ║   Base class for all messaging platform adapters               ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

class BaseAdapter {
    constructor(config, router) {
        this.config = config;
        this.router = router;
        this.name = 'BaseAdapter';
        this.platform = 'base';
    }

    /**
     * Start the adapter
     */
    async start() {
        throw new Error('start() must be implemented');
    }

    /**
     * Stop the adapter
     */
    async stop() {
        throw new Error('stop() must be implemented');
    }

    /**
     * Check if a user is allowed
     */
    isAllowed(userId) {
        // If no allowed users specified, allow everyone
        if (!this.config.allowedUsers || this.config.allowedUsers.length === 0) {
            return true;
        }
        return this.config.allowedUsers.includes(userId);
    }

    /**
     * Check if a user is admin
     */
    isAdmin(userId) {
        if (!this.config.adminUsers || this.config.adminUsers.length === 0) {
            return false;
        }
        return this.config.adminUsers.includes(userId);
    }

    /**
     * Create a message object to pass to router
     */
    createMessage(data) {
        return {
            content: data.content,
            userId: data.userId,
            platform: this.platform,
            channelId: data.channelId,
            isAdmin: this.isAdmin(data.userId),
            reply: data.reply,
            sendTyping: data.sendTyping,
            rawMessage: data.rawMessage,
        };
    }
}

module.exports = BaseAdapter;
