/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     FREPPEBOT PLUGIN SDK                       ║
 * ║                                                                 ║
 * ║   The easiest way to create plugins for your AI assistant!    ║
 * ║                                                                 ║
 * ║   Example:                                                      ║
 * ║   ───────────────────────────────────────────────────────────  ║
 * ║   const { Plugin } = require('freppebot/sdk');                 ║
 * ║                                                                 ║
 * ║   module.exports = new Plugin({                                ║
 * ║     name: 'my-plugin',                                         ║
 * ║     description: 'Does cool stuff',                            ║
 * ║     commands: { ... },                                         ║
 * ║     tools: { ... }                                             ║
 * ║   });                                                           ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const Plugin = require('./Plugin');
const Context = require('./Context');

module.exports = {
    Plugin,
    Context,

    // Helper functions for common patterns
    helpers: {
        /**
         * Format a response with an emoji prefix
         */
        formatResponse(emoji, message) {
            return `${emoji} ${message}`;
        },

        /**
         * Format a success message
         */
        success(message) {
            return `✅ ${message}`;
        },

        /**
         * Format an error message
         */
        error(message) {
            return `❌ ${message}`;
        },

        /**
         * Format a warning message
         */
        warning(message) {
            return `⚠️ ${message}`;
        },

        /**
         * Format an info message
         */
        info(message) {
            return `ℹ️ ${message}`;
        },

        /**
         * Format code block
         */
        code(content, language = '') {
            return `\`\`\`${language}\n${content}\n\`\`\``;
        },

        /**
         * Truncate text to max length
         */
        truncate(text, maxLength = 1500) {
            if (text.length <= maxLength) return text;
            return text.substring(0, maxLength - 3) + '...';
        },

        /**
         * Parse key=value arguments
         */
        parseArgs(args) {
            const result = {};
            const positional = [];

            for (const arg of args) {
                if (arg.includes('=')) {
                    const [key, ...valueParts] = arg.split('=');
                    result[key] = valueParts.join('=');
                } else {
                    positional.push(arg);
                }
            }

            result._positional = positional;
            return result;
        },
    },
};
