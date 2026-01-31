/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     REMINDER PLUGIN                            ║
 * ║                                                                 ║
 * ║   Set reminders and get proactive notifications                ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const { Plugin, helpers } = require('../../src/plugins/sdk');

module.exports = new Plugin({
    name: 'reminder',
    description: 'Set reminders and scheduled notifications',
    version: '1.0.0',
    author: 'FreppeBot',

    commands: {
        remind: {
            description: 'Set a reminder: !remind <time> <message>',
            args: ['time', 'message'],
            handler: async (ctx, args) => {
                if (args.length < 2) {
                    return helpers.error('Usage: !remind <time> <message>\nExamples:\n• !remind 10m Check the oven\n• !remind 2h Call mom\n• !remind 1d Submit report');
                }

                const timeStr = args[0];
                const message = args.slice(1).join(' ');

                // Parse time string
                const ms = parseTimeString(timeStr);
                if (!ms) {
                    return helpers.error('Invalid time format. Use: 10s, 5m, 2h, 1d');
                }

                const remindAt = new Date(Date.now() + ms);
                const remindAtISO = remindAt.toISOString();

                // Store reminder in database
                const db = ctx.getDatabase();
                const channelId = ctx.message.channelId || null;
                db.addReminder(
                    ctx.getUserId(),
                    ctx.getPlatform(),
                    message,
                    remindAtISO,
                    channelId
                );

                // Log for debugging
                const logger = require('../../src/utils/logger');
                logger.info(`📝 Reminder created: "${message}" for ${ctx.getUserId()} on ${ctx.getPlatform()}, due at ${remindAtISO} (in ${formatDuration(ms)})`);

                const timeLabel = formatDuration(ms);
                return helpers.success(`I'll remind you in ${timeLabel}: "${message}"`);
            },
        },

        reminders: {
            description: 'List your pending reminders',
            handler: async (ctx) => {
                const db = ctx.getDatabase();
                const stmt = db.db.prepare(`
                    SELECT * FROM reminders 
                    WHERE user_id = ? AND platform = ? AND completed = 0
                    ORDER BY remind_at ASC
                `);
                stmt.bind([ctx.getUserId(), ctx.getPlatform()]);

                const reminders = [];
                while (stmt.step()) {
                    reminders.push(stmt.getAsObject());
                }
                stmt.free();

                if (reminders.length === 0) {
                    return helpers.info('You have no pending reminders');
                }

                let msg = '⏰ **Your Reminders**\n\n';
                for (const r of reminders) {
                    const when = new Date(r.remind_at);
                    const relative = getRelativeTime(when);
                    msg += `• **${relative}**: ${r.message}\n`;
                }
                return msg;
            },
        },
    },

    tools: {
        setReminder: {
            description: 'Set a reminder for the user',
            parameters: {
                message: {
                    type: 'string',
                    description: 'The reminder message',
                },
                delay: {
                    type: 'string',
                    description: 'Time until reminder (e.g. "10s", "5m", "2h")',
                },
            },
            execute: async (params, ctx) => {
                const logger = require('../../src/utils/logger');
                logger.info(`[setReminder] Tool called with params:`, JSON.stringify(params));
                
                const ms = parseTimeString(params.delay);
                if (!ms) {
                    logger.warn(`[setReminder] Invalid time format: ${params.delay}`);
                    return { success: false, error: 'Invalid time format. Use 10s, 5m, 2h' };
                }

                const remindAt = new Date(Date.now() + ms);
                logger.info(`[setReminder] Parsed delay: ${ms}ms, remindAt: ${remindAt.toISOString()}`);

                const db = ctx.getDatabase();
                const channelId = ctx.message.channelId || null;
                logger.info(`[setReminder] Adding reminder to database: userId=${ctx.getUserId()}, platform=${ctx.getPlatform()}, message="${params.message}"`);
                
                try {
                    db.addReminder(
                        ctx.getUserId(),
                        ctx.getPlatform(),
                        params.message,
                        remindAt.toISOString(),
                        channelId
                    );
                    logger.info(`[setReminder] Reminder added successfully to database`);
                } catch (error) {
                    logger.error(`[setReminder] Failed to add reminder to database:`, error);
                    return { success: false, error: `Database error: ${error.message}` };
                }

                const result = {
                    success: true,
                    message: params.message,
                    remindAt: remindAt.toISOString(),
                    formattedTime: formatDuration(ms)
                };
                logger.info(`[setReminder] Returning result:`, JSON.stringify(result));
                return result;
            },
        },

        listReminders: {
            description: 'List pending reminders for the user',
            parameters: {},
            execute: async (params, ctx) => {
                const db = ctx.getDatabase();
                const stmt = db.db.prepare(`
                    SELECT message, remind_at FROM reminders 
                    WHERE user_id = ? AND platform = ? AND completed = 0
                    ORDER BY remind_at ASC
                `);
                stmt.bind([ctx.getUserId(), ctx.getPlatform()]);

                const reminders = [];
                while (stmt.step()) {
                    reminders.push(stmt.getAsObject());
                }
                stmt.free();

                return {
                    count: reminders.length,
                    reminders: reminders.map(r => ({
                        message: r.message,
                        remindAt: r.remind_at,
                    })),
                };
            },
        },
    },
});

// Helper functions
function parseTimeString(str) {
    if (!str) return null;
    const match = str.trim().match(/^(\d+)\s*(s|m|h|d)$/i);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    const multipliers = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
    };

    return value * multipliers[unit];
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    return `${seconds} second${seconds > 1 ? 's' : ''}`;
}

function getRelativeTime(date) {
    const now = new Date();
    const diff = date - now;

    if (diff < 0) return 'overdue';

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `in ${days}d`;
    if (hours > 0) return `in ${hours}h`;
    if (minutes > 0) return `in ${minutes}m`;
    return 'soon';
}
