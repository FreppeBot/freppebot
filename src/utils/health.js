/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     HEALTH CHECK                               ║
 * ║                                                                 ║
 * ║   Monitors bot health and provides status information          ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const os = require('os');

class HealthMonitor {
    constructor(bot) {
        this.bot = bot;
        this.startTime = Date.now();
        this.stats = {
            messagesProcessed: 0,
            commandsExecuted: 0,
            errors: 0,
            lastError: null,
            lastErrorTime: null,
        };
    }

    /**
     * Record a processed message
     */
    recordMessage() {
        this.stats.messagesProcessed++;
    }

    /**
     * Record a command execution
     */
    recordCommand() {
        this.stats.commandsExecuted++;
    }

    /**
     * Record an error
     */
    recordError(error) {
        this.stats.errors++;
        this.stats.lastError = error.message || String(error);
        this.stats.lastErrorTime = new Date().toISOString();
    }

    /**
     * Get health status
     */
    getHealth() {
        const uptime = Date.now() - this.startTime;
        const uptimeSeconds = Math.floor(uptime / 1000);
        const uptimeMinutes = Math.floor(uptimeSeconds / 60);
        const uptimeHours = Math.floor(uptimeMinutes / 60);
        const uptimeDays = Math.floor(uptimeHours / 24);

        const formatUptime = () => {
            if (uptimeDays > 0) return `${uptimeDays}d ${uptimeHours % 24}h`;
            if (uptimeHours > 0) return `${uptimeHours}h ${uptimeMinutes % 60}m`;
            if (uptimeMinutes > 0) return `${uptimeMinutes}m ${uptimeSeconds % 60}s`;
            return `${uptimeSeconds}s`;
        };

        // Check adapters
        const adapters = this.bot.adapters || [];
        const adapterStatus = adapters.map(adapter => {
            let status = 'unknown';
            if (adapter.platform === 'discord') {
                status = adapter.client?.isReady() ? 'connected' : 'disconnected';
            } else if (adapter.platform === 'telegram') {
                status = adapter.bot ? 'connected' : 'disconnected';
            }
            return {
                name: adapter.name,
                platform: adapter.platform,
                status,
            };
        });

        // Get database stats
        let dbStats = null;
        if (this.bot.database) {
            try {
                dbStats = this.bot.database.getStats();
            } catch (error) {
                // Database might not be initialized
            }
        }

        // System info
        const systemInfo = {
            platform: os.platform(),
            arch: os.arch(),
            nodeVersion: process.version,
            memory: {
                total: Math.round(os.totalmem() / 1024 / 1024), // MB
                free: Math.round(os.freemem() / 1024 / 1024), // MB
                used: Math.round((os.totalmem() - os.freemem()) / 1024 / 1024), // MB
                usagePercent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100),
            },
            cpu: {
                cores: os.cpus().length,
                model: os.cpus()[0]?.model || 'Unknown',
            },
            uptime: formatUptime(),
            uptimeSeconds,
        };

        // Plugin info
        const pluginCount = this.bot.pluginRegistry?.getPluginCount() || 0;

        return {
            status: 'healthy',
            uptime: formatUptime(),
            uptimeSeconds,
            startTime: new Date(this.startTime).toISOString(),
            adapters: adapterStatus,
            stats: {
                ...this.stats,
                pluginCount,
            },
            database: dbStats,
            system: systemInfo,
        };
    }

    /**
     * Get formatted health report
     */
    getHealthReport() {
        const health = this.getHealth();
        
        let report = `🏥 **Health Status**\n\n`;
        report += `**Status:** ${health.status}\n`;
        report += `**Uptime:** ${health.uptime}\n`;
        report += `**Started:** ${new Date(health.startTime).toLocaleString()}\n\n`;

        report += `**Adapters:**\n`;
        for (const adapter of health.adapters) {
            const statusEmoji = adapter.status === 'connected' ? '🟢' : '🔴';
            report += `${statusEmoji} ${adapter.name} (${adapter.platform}): ${adapter.status}\n`;
        }
        report += '\n';

        report += `**Statistics:**\n`;
        report += `• Messages processed: ${health.stats.messagesProcessed}\n`;
        report += `• Commands executed: ${health.stats.commandsExecuted}\n`;
        report += `• Errors: ${health.stats.errors}\n`;
        report += `• Plugins loaded: ${health.stats.pluginCount}\n`;
        if (health.stats.lastError) {
            report += `• Last error: ${health.stats.lastError}\n`;
            report += `• Last error time: ${health.stats.lastErrorTime}\n`;
        }
        report += '\n';

        if (health.database) {
            report += `**Database:**\n`;
            report += `• Messages: ${health.database.totalMessages}\n`;
            report += `• Users: ${health.database.uniqueUsers}\n`;
            report += `• Memories: ${health.database.totalMemories}\n`;
            report += `• Pending reminders: ${health.database.pendingReminders}\n`;
            if (health.database.dbSizeBytes) {
                const sizeMB = (health.database.dbSizeBytes / 1024 / 1024).toFixed(2);
                report += `• Size: ${sizeMB} MB\n`;
            }
            report += '\n';
        }

        report += `**System:**\n`;
        report += `• Platform: ${health.system.platform} ${health.system.arch}\n`;
        report += `• Node: ${health.system.nodeVersion}\n`;
        report += `• CPU: ${health.system.cpu.cores} cores (${health.system.cpu.model})\n`;
        report += `• Memory: ${health.system.memory.used}MB / ${health.system.memory.total}MB (${health.system.memory.usagePercent}% used)\n`;

        return report;
    }

    /**
     * Reset statistics
     */
    reset() {
        this.stats = {
            messagesProcessed: 0,
            commandsExecuted: 0,
            errors: 0,
            lastError: null,
            lastErrorTime: null,
        };
    }
}

module.exports = HealthMonitor;

