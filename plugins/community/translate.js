/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     TRANSLATE PLUGIN                           ║
 * ║                                                                 ║
 * ║   Translate text between languages using free API             ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const { Plugin, helpers } = require('../../src/plugins/sdk');
const fetch = require('node-fetch');

module.exports = new Plugin({
    name: 'translate',
    description: 'Translate text between languages',
    version: '1.0.0',
    author: 'FreppeBot',

    commands: {
        translate: {
            description: 'Translate text: !translate <text> to <language>',
            handler: async (ctx, args) => {
                if (args.length < 3) {
                    return helpers.error('Usage: !translate <text> to <language>\nExample: !translate Hello to Spanish');
                }

                const textIndex = args.indexOf('to');
                if (textIndex === -1) {
                    return helpers.error('Usage: !translate <text> to <language>');
                }

                const text = args.slice(0, textIndex).join(' ');
                const targetLang = args.slice(textIndex + 1).join(' ');

                try {
                    // Use LibreTranslate (free, no API key needed)
                    const response = await fetch('https://libretranslate.de/translate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            q: text,
                            source: 'auto',
                            target: targetLang.toLowerCase(),
                            format: 'text',
                        }),
                    });

                    if (!response.ok) {
                        throw new Error('Translation service unavailable');
                    }

                    const data = await response.json();
                    return `🌐 **Translation**\n\n**Original:** ${text}\n**${targetLang}:** ${data.translatedText}`;
                } catch (error) {
                    return helpers.error(`Translation failed: ${error.message}`);
                }
            },
        },
    },

    tools: {
        translateText: {
            description: 'Translate text to another language',
            parameters: {
                text: {
                    type: 'string',
                    description: 'Text to translate',
                },
                targetLanguage: {
                    type: 'string',
                    description: 'Target language (e.g., "spanish", "french", "german")',
                },
            },
            execute: async (params) => {
                try {
                    const response = await fetch('https://libretranslate.de/translate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            q: params.text,
                            source: 'auto',
                            target: params.targetLanguage.toLowerCase(),
                            format: 'text',
                        }),
                    });

                    if (!response.ok) {
                        return { success: false, error: 'Translation service unavailable' };
                    }

                    const data = await response.json();
                    return {
                        success: true,
                        original: params.text,
                        translated: data.translatedText,
                        targetLanguage: params.targetLanguage,
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },
    },
});

