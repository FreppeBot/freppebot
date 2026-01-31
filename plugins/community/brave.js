/**
 * 🔍 BRAVE SEARCH PLUGIN
 * 
 * Search the web using Brave Search API
 * 
 * Get your API key from: https://brave.com/search/api/
 * Free tier: 2000 queries/month
 * 
 * Commands: !search <query>
 * AI Tools: webSearch, searchNews
 */

const { Plugin } = require('../../src/plugins/sdk');
const fetch = require('node-fetch');

const BRAVE_API_URL = 'https://api.search.brave.com/res/v1';

async function braveSearch(query, config, options = {}) {
    const apiKey = config?.apiKey || process.env.BRAVE_API_KEY;

    if (!apiKey) {
        throw new Error('Brave API key not configured');
    }

    const params = new URLSearchParams({
        q: query,
        count: options.count || 5,
        ...options.extra,
    });

    const endpoint = options.type === 'news' ? '/news/search' : '/web/search';

    const response = await fetch(`${BRAVE_API_URL}${endpoint}?${params}`, {
        headers: {
            'Accept': 'application/json',
            'X-Subscription-Token': apiKey,
        },
    });

    if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
    }

    return response.json();
}

function formatResults(data, type = 'web') {
    if (type === 'news') {
        const results = data.results || [];
        return results.map(r => ({
            title: r.title,
            url: r.url,
            description: r.description,
            age: r.age,
        }));
    }

    const results = data.web?.results || [];
    return results.map(r => ({
        title: r.title,
        url: r.url,
        description: r.description,
    }));
}

module.exports = new Plugin({
    name: 'brave',
    description: 'Search the web using Brave Search',
    version: '1.0.0',

    commands: {
        search: {
            description: 'Search the web: !search <query>',
            handler: async (ctx, args) => {
                if (args.length === 0) {
                    return '🔍 Usage: !search <query>';
                }

                try {
                    const config = ctx.bot.getConfig().plugins?.brave;
                    const query = args.join(' ');
                    const data = await braveSearch(query, config);
                    const results = formatResults(data);

                    if (results.length === 0) {
                        return `No results for "${query}"`;
                    }

                    let msg = `🔍 **Results for "${query}"**\n\n`;
                    for (const r of results.slice(0, 3)) {
                        msg += `**${r.title}**\n${r.description}\n${r.url}\n\n`;
                    }
                    return msg.trim();
                } catch (error) {
                    return `❌ ${error.message}`;
                }
            },
        },

        news: {
            description: 'Search news: !news <topic>',
            handler: async (ctx, args) => {
                if (args.length === 0) {
                    return '📰 Usage: !news <topic>';
                }

                try {
                    const config = ctx.bot.getConfig().plugins?.brave;
                    const query = args.join(' ');
                    const data = await braveSearch(query, config, { type: 'news' });
                    const results = formatResults(data, 'news');

                    if (results.length === 0) {
                        return `No news for "${query}"`;
                    }

                    let msg = `📰 **News: "${query}"**\n\n`;
                    for (const r of results.slice(0, 3)) {
                        msg += `**${r.title}** (${r.age})\n${r.url}\n\n`;
                    }
                    return msg.trim();
                } catch (error) {
                    return `❌ ${error.message}`;
                }
            },
        },
    },

    tools: {
        webSearch: {
            description: 'Search the web for information. Use this when you need current info, facts, or to answer questions you don\'t know.',
            parameters: {
                query: {
                    type: 'string',
                    description: 'Search query',
                },
                count: {
                    type: 'number',
                    description: 'Number of results (1-10)',
                    required: false,
                },
            },
            execute: async (params, ctx) => {
                try {
                    const config = ctx.bot?.getConfig()?.plugins?.brave;
                    const data = await braveSearch(params.query, config, {
                        count: Math.min(params.count || 5, 10)
                    });
                    const results = formatResults(data);

                    return {
                        query: params.query,
                        results: results.map(r => ({
                            title: r.title,
                            snippet: r.description,
                            url: r.url,
                        })),
                    };
                } catch (error) {
                    return { error: error.message };
                }
            },
        },

        searchNews: {
            description: 'Search for recent news articles on a topic',
            parameters: {
                topic: {
                    type: 'string',
                    description: 'News topic to search',
                },
            },
            execute: async (params, ctx) => {
                try {
                    const config = ctx.bot?.getConfig()?.plugins?.brave;
                    const data = await braveSearch(params.topic, config, { type: 'news' });
                    const results = formatResults(data, 'news');

                    return {
                        topic: params.topic,
                        articles: results.map(r => ({
                            title: r.title,
                            age: r.age,
                            url: r.url,
                        })),
                    };
                } catch (error) {
                    return { error: error.message };
                }
            },
        },
    },
});
