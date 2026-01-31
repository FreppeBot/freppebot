/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     MEMORY PLUGIN                              ║
 * ║                                                                 ║
 * ║   Remember and recall information across conversations         ║
 * ╚═══════════════════════════════════════════════════════════════╝
 * 
 * Example of an easy-to-create plugin using the FreppeBot SDK!
 */

const { Plugin, helpers } = require('../../src/plugins/sdk');

module.exports = new Plugin({
    name: 'memory',
    description: 'Remember and recall information',
    version: '1.0.0',
    author: 'FreppeBot',

    // Commands users can invoke directly with !command
    commands: {
        remember: {
            description: 'Remember something: !remember <key> <value>',
            args: ['key', 'value'],
            handler: async (ctx, args) => {
                if (args.length < 2) {
                    return helpers.error('Usage: !remember <key> <value>');
                }

                const key = args[0];
                const value = args.slice(1).join(' ');

                await ctx.remember(key, value);
                return helpers.success(`I'll remember that "${key}" is "${value}"`);
            },
        },

        recall: {
            description: 'Recall something: !recall <key>',
            args: ['key'],
            handler: async (ctx, args) => {
                if (args.length < 1) {
                    return helpers.error('Usage: !recall <key>');
                }

                const key = args[0];
                const value = await ctx.recall(key);

                if (value) {
                    return helpers.info(`${key}: ${value}`);
                } else {
                    return helpers.warning(`I don't remember anything about "${key}"`);
                }
            },
        },

        memories: {
            description: 'List all memories',
            handler: async (ctx) => {
                const memory = ctx.getMemory();
                const memories = memory.getRelevantMemories(ctx.getUserId(), ctx.getPlatform(), 20);

                if (memories.length === 0) {
                    return helpers.info("I don't have any memories for you yet!");
                }

                let msg = '🧠 **Your Memories**\n\n';
                for (const m of memories) {
                    msg += `• **${m.key}**: ${m.content}\n`;
                }
                return msg;
            },
        },
    },

    // Tools that AI can use automatically
    tools: {
        remember: {
            description: 'Remember a piece of information about the user for later',
            parameters: {
                key: {
                    type: 'string',
                    description: 'A short key/label for this memory (e.g., "favorite_color", "timezone")',
                },
                value: {
                    type: 'string',
                    description: 'The value to remember',
                },
            },
            execute: async (params, ctx) => {
                await ctx.remember(params.key, params.value);
                return { success: true, message: `Remembered: ${params.key} = ${params.value}` };
            },
        },

        recall: {
            description: 'Recall a piece of information about the user',
            parameters: {
                key: {
                    type: 'string',
                    description: 'The key to look up',
                },
            },
            execute: async (params, ctx) => {
                const value = await ctx.recall(params.key);
                if (value) {
                    return { found: true, key: params.key, value };
                }
                return { found: false, key: params.key };
            },
        },
    },
});
