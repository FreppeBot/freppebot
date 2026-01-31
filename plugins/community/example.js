/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     EXAMPLE COMMUNITY PLUGIN                   ║
 * ║                                                                 ║
 * ║   This is a template for creating your own plugins!           ║
 * ║   Just copy this file and modify it.                          ║
 * ╚═══════════════════════════════════════════════════════════════╝
 * 
 * Creating a plugin is SUPER EASY:
 * 
 * 1. Create a .js file in plugins/community/
 * 2. Export a Plugin object with name, description, commands, and tools
 * 3. That's it! The plugin will auto-load (no restart needed!)
 */

const { Plugin, helpers } = require('../../src/plugins/sdk');

module.exports = new Plugin({
    // Required: Give your plugin a unique name
    name: 'example',

    // Required: Describe what it does
    description: 'An example plugin to show how easy it is!',

    // Optional: Version number
    version: '1.0.0',

    // Optional: Your name
    author: 'Your Name',

    // Optional: Require admin for all commands/tools
    // requiresAdmin: true,

    // Optional: Called when plugin loads
    onLoad: async () => {
        console.log('Example plugin loaded!');
    },

    // Optional: Called when plugin unloads
    onUnload: async () => {
        console.log('Example plugin unloaded!');
    },

    // Commands users can type directly (e.g., !hello)
    commands: {
        hello: {
            description: 'Say hello!',
            // args: ['name'], // Optional: document expected arguments
            handler: async (ctx, args) => {
                const name = args[0] || 'friend';
                return `👋 Hello, ${name}! I'm FreppeBot!`;
            },
        },

        dice: {
            description: 'Roll a dice: !dice [sides]',
            handler: async (ctx, args) => {
                const sides = parseInt(args[0]) || 6;
                const result = Math.floor(Math.random() * sides) + 1;
                return `🎲 You rolled a **${result}** (d${sides})`;
            },
        },

        coin: {
            description: 'Flip a coin',
            handler: async () => {
                const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
                return `🪙 ${result}!`;
            },
        },
    },

    // Tools the AI can use automatically during conversation
    tools: {
        rollDice: {
            description: 'Roll a dice with specified number of sides',
            parameters: {
                sides: {
                    type: 'number',
                    description: 'Number of sides on the dice (default: 6)',
                    required: false,
                },
                count: {
                    type: 'number',
                    description: 'Number of dice to roll (default: 1)',
                    required: false,
                },
            },
            execute: async (params) => {
                const sides = params.sides || 6;
                const count = params.count || 1;

                const rolls = [];
                for (let i = 0; i < count; i++) {
                    rolls.push(Math.floor(Math.random() * sides) + 1);
                }

                return {
                    sides,
                    count,
                    rolls,
                    total: rolls.reduce((a, b) => a + b, 0),
                };
            },
        },

        generateRandomNumber: {
            description: 'Generate a random number between min and max',
            parameters: {
                min: 'number',
                max: 'number',
            },
            execute: async (params) => {
                const result = Math.floor(Math.random() * (params.max - params.min + 1)) + params.min;
                return { min: params.min, max: params.max, result };
            },
        },
    },
});
