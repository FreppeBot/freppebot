/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     SYSTEM INFO PLUGIN                         ║
 * ║                                                                 ║
 * ║   Get system information and bot status                        ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const { Plugin, helpers } = require('../../src/plugins/sdk');
const os = require('os');

module.exports = new Plugin({
    name: 'system',
    description: 'Get system information and bot status',
    version: '1.0.0',
    author: 'FreppeBot',

    commands: {
        status: {
            description: 'Show bot status',
            handler: async (ctx) => {
                const uptime = process.uptime();
                const memUsage = process.memoryUsage();

                let msg = '🤖 **FreppeBot Status**\n\n';
                msg += `**Uptime:** ${formatUptime(uptime)}\n`;
                msg += `**Memory:** ${formatBytes(memUsage.heapUsed)} / ${formatBytes(memUsage.heapTotal)}\n`;
                msg += `**Node.js:** ${process.version}\n`;
                msg += `**Platform:** ${process.platform}\n`;

                return msg;
            },
        },

        sysinfo: {
            description: 'Show system information',
            requiresAdmin: true,
            handler: async (ctx) => {
                if (!ctx.isAdmin) {
                    return helpers.error('Admin privileges required');
                }

                let msg = '💻 **System Information**\n\n';
                msg += `**OS:** ${os.type()} ${os.release()}\n`;
                msg += `**Hostname:** ${os.hostname()}\n`;
                msg += `**CPUs:** ${os.cpus().length}x ${os.cpus()[0].model}\n`;
                msg += `**Memory:** ${formatBytes(os.freemem())} free / ${formatBytes(os.totalmem())} total\n`;
                msg += `**Uptime:** ${formatUptime(os.uptime())}\n`;
                msg += `**Load:** ${os.loadavg().map(l => l.toFixed(2)).join(', ')}\n`;

                return msg;
            },
        },

        ping: {
            description: 'Check if the bot is alive',
            handler: async () => {
                const start = Date.now();
                await new Promise(r => setTimeout(r, 1));
                const latency = Date.now() - start;
                return `🏓 Pong! Latency: ${latency}ms`;
            },
        },
    },

    tools: {
        getSystemInfo: {
            description: 'Get information about the host system',
            parameters: {},
            execute: async () => {
                return {
                    os: {
                        type: os.type(),
                        platform: os.platform(),
                        release: os.release(),
                        hostname: os.hostname(),
                    },
                    cpu: {
                        count: os.cpus().length,
                        model: os.cpus()[0].model,
                    },
                    memory: {
                        total: os.totalmem(),
                        free: os.freemem(),
                        used: os.totalmem() - os.freemem(),
                    },
                    uptime: os.uptime(),
                };
            },
        },

        getBotStatus: {
            description: 'Get the current status of the bot',
            parameters: {},
            execute: async () => {
                const memUsage = process.memoryUsage();
                return {
                    uptime: process.uptime(),
                    memory: {
                        heapUsed: memUsage.heapUsed,
                        heapTotal: memUsage.heapTotal,
                        external: memUsage.external,
                    },
                    nodeVersion: process.version,
                    platform: process.platform,
                };
            },
        },
    },
});

function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

    return parts.join(' ');
}

function formatBytes(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let unit = 0;
    let value = bytes;

    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }

    return `${value.toFixed(1)} ${units[unit]}`;
}
