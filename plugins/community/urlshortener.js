/**
 * 🔗 URL SHORTENER PLUGIN
 * 
 * Shorten URLs using free services (no API key needed!)
 * Uses is.gd and TinyURL as fallbacks
 * 
 * Commands: !shorten <url>
 * AI Tools: shortenUrl
 */

const { Plugin, helpers } = require('../../src/plugins/sdk');
const fetch = require('node-fetch');

async function shortenWithIsGd(url) {
    const response = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`);
    const data = await response.json();
    if (data.shorturl) {
        return data.shorturl;
    }
    throw new Error(data.errormessage || 'is.gd failed');
}

async function shortenWithTinyUrl(url) {
    const response = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
    const shortUrl = await response.text();
    if (shortUrl.startsWith('http')) {
        return shortUrl;
    }
    throw new Error('TinyURL failed');
}

async function shortenUrl(url) {
    // Validate URL
    try {
        new URL(url);
    } catch {
        throw new Error('Invalid URL');
    }

    // Try is.gd first, then TinyURL
    try {
        return await shortenWithIsGd(url);
    } catch {
        return await shortenWithTinyUrl(url);
    }
}

module.exports = new Plugin({
    name: 'urlshortener',
    description: 'Shorten URLs (free, no API key needed)',
    version: '1.0.0',

    commands: {
        shorten: {
            description: 'Shorten a URL: !shorten <url>',
            handler: async (ctx, args) => {
                if (args.length === 0) {
                    return '🔗 Usage: !shorten <url>';
                }

                try {
                    const shortUrl = await shortenUrl(args[0]);
                    return `🔗 ${shortUrl}`;
                } catch (error) {
                    return `❌ ${error.message}`;
                }
            },
        },
    },

    tools: {
        shortenUrl: {
            description: 'Shorten a long URL',
            parameters: {
                url: {
                    type: 'string',
                    description: 'The URL to shorten',
                },
            },
            execute: async (params) => {
                try {
                    const shortUrl = await shortenUrl(params.url);
                    return { shortUrl, originalUrl: params.url };
                } catch (error) {
                    return { error: error.message };
                }
            },
        },
    },
});
