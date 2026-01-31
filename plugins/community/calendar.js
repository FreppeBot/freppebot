/**
 * 📅 CALENDAR/SCHEDULING PLUGIN
 * 
 * Schedule events, manage tasks, get daily agenda
 * Events stored in SQLite database
 * 
 * Commands: !event, !agenda, !tasks
 * AI Tools: createEvent, getAgenda, createTask
 */

const { Plugin, helpers } = require('../../src/plugins/sdk');

// Parse natural time like "tomorrow 3pm", "next monday"
function parseTime(input) {
    const now = new Date();
    const lower = input.toLowerCase();

    // Handle relative days
    if (lower.includes('today')) {
        return parseTimeOfDay(now, lower);
    }
    if (lower.includes('tomorrow')) {
        const date = new Date(now);
        date.setDate(date.getDate() + 1);
        return parseTimeOfDay(date, lower);
    }

    // Handle "in X hours/minutes"
    const inMatch = lower.match(/in (\d+) (hour|minute|min|hr)/);
    if (inMatch) {
        const amount = parseInt(inMatch[1]);
        const unit = inMatch[2];
        const date = new Date(now);
        if (unit.startsWith('hour') || unit.startsWith('hr')) {
            date.setHours(date.getHours() + amount);
        } else {
            date.setMinutes(date.getMinutes() + amount);
        }
        return date;
    }

    // Handle day names
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < days.length; i++) {
        if (lower.includes(days[i])) {
            const date = new Date(now);
            const currentDay = date.getDay();
            let daysUntil = i - currentDay;
            if (daysUntil <= 0) daysUntil += 7;
            date.setDate(date.getDate() + daysUntil);
            return parseTimeOfDay(date, lower);
        }
    }

    // Try direct date parse
    const parsed = new Date(input);
    if (!isNaN(parsed.getTime())) {
        return parsed;
    }

    return null;
}

function parseTimeOfDay(date, input) {
    // Look for time patterns like 3pm, 15:00, 3:30pm
    const timeMatch = input.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]) || 0;
        const period = timeMatch[3]?.toLowerCase();

        if (period === 'pm' && hours < 12) hours += 12;
        if (period === 'am' && hours === 12) hours = 0;

        date.setHours(hours, minutes, 0, 0);
    } else {
        date.setHours(9, 0, 0, 0); // Default to 9am
    }
    return date;
}

function formatDate(date) {
    return new Date(date).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

module.exports = new Plugin({
    name: 'calendar',
    description: 'Schedule events and manage tasks',
    version: '1.0.0',

    onLoad: async function () {
        // Events table will be created by database manager
    },

    commands: {
        event: {
            description: 'Create event: !event <title> at <time>',
            handler: async (ctx, args) => {
                if (args.length === 0) {
                    return '📅 Usage: !event Meeting at tomorrow 3pm';
                }

                const input = args.join(' ');
                const atIndex = input.toLowerCase().lastIndexOf(' at ');

                if (atIndex === -1) {
                    return '📅 Please specify a time with "at", e.g., !event Meeting at 3pm';
                }

                const title = input.substring(0, atIndex).trim();
                const timeStr = input.substring(atIndex + 4).trim();
                const eventTime = parseTime(timeStr);

                if (!eventTime) {
                    return `❌ Couldn't understand time: "${timeStr}"`;
                }

                // Store in database
                const db = ctx.bot.getDatabase();
                db.setPluginData('calendar', `event_${Date.now()}`, {
                    title,
                    time: eventTime.toISOString(),
                    userId: ctx.message.userId,
                    platform: ctx.message.platform,
                });

                return `📅 Event created: **${title}**\n🕐 ${formatDate(eventTime)}`;
            },
        },

        agenda: {
            description: 'Show upcoming events',
            handler: async (ctx) => {
                const db = ctx.bot.getDatabase();
                const events = [];
                const now = new Date();

                // Get all events from plugin data
                const allData = db.query(`SELECT * FROM plugin_data WHERE plugin_name = 'calendar' AND key LIKE 'event_%'`);

                for (const row of allData) {
                    const event = JSON.parse(row.value);
                    if (event.userId === ctx.message.userId && new Date(event.time) >= now) {
                        events.push(event);
                    }
                }

                if (events.length === 0) {
                    return '📅 No upcoming events';
                }

                events.sort((a, b) => new Date(a.time) - new Date(b.time));

                let msg = '📅 **Upcoming Events**\n\n';
                for (const event of events.slice(0, 10)) {
                    msg += `• **${event.title}**\n  ${formatDate(event.time)}\n`;
                }
                return msg;
            },
        },
    },

    tools: {
        createEvent: {
            description: 'Create a calendar event',
            parameters: {
                title: {
                    type: 'string',
                    description: 'Event title',
                },
                time: {
                    type: 'string',
                    description: 'When (e.g., "tomorrow 3pm", "next monday 10am")',
                },
            },
            execute: async (params, ctx) => {
                const eventTime = parseTime(params.time);
                if (!eventTime) {
                    return { error: `Couldn't parse time: ${params.time}` };
                }

                const db = ctx.bot.getDatabase();
                const eventId = `event_${Date.now()}`;

                db.setPluginData('calendar', eventId, {
                    title: params.title,
                    time: eventTime.toISOString(),
                    userId: ctx.message.userId,
                    platform: ctx.message.platform,
                });

                return {
                    success: true,
                    title: params.title,
                    time: formatDate(eventTime),
                };
            },
        },

        getAgenda: {
            description: 'Get upcoming events for the user',
            parameters: {
                days: {
                    type: 'number',
                    description: 'How many days ahead to look (default: 7)',
                    required: false,
                },
            },
            execute: async (params, ctx) => {
                const db = ctx.bot.getDatabase();
                const events = [];
                const now = new Date();
                const daysAhead = params.days || 7;
                const endDate = new Date(now);
                endDate.setDate(endDate.getDate() + daysAhead);

                const allData = db.query(`SELECT * FROM plugin_data WHERE plugin_name = 'calendar' AND key LIKE 'event_%'`);

                for (const row of allData) {
                    const event = JSON.parse(row.value);
                    const eventDate = new Date(event.time);
                    if (event.userId === ctx.message.userId && eventDate >= now && eventDate <= endDate) {
                        events.push({
                            title: event.title,
                            time: formatDate(event.time),
                        });
                    }
                }

                events.sort((a, b) => new Date(a.time) - new Date(b.time));
                return { events };
            },
        },
    },
});
