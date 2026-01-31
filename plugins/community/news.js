/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     NEWS PLUGIN                                ║
 * ║                                                                 ║
 * ║   Get latest news from various sources                         ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const { Plugin, helpers } = require('../../src/plugins/sdk');
const fetch = require('node-fetch');

module.exports = new Plugin({
    name: 'news',
    description: 'Get latest news articles',
    version: '1.0.0',
    author: 'FreppeBot',

    commands: {
        news: {
            description: 'Get news: !news [topic]',
            handler: async (ctx, args) => {
                const topic = args.length > 0 ? args.join(' ') : 'technology';

                try {
                    // Using NewsAPI (free tier available)
                    // For demo, using a simple approach
                    const apiKey = ctx.getConfig().plugins?.news?.apiKey;
                    
                    if (!apiKey) {
                        // Fallback: use RSS or alternative
                        return helpers.info('News API key not configured. Set plugins.news.apiKey in config.json\n\nYou can get a free key from https://newsapi.org/');
                    }

                    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(topic)}&sortBy=publishedAt&pageSize=5&apiKey=${apiKey}`;
                    const response = await fetch(url);
                    const data = await response.json();

                    if (data.status !== 'ok') {
                        throw new Error(data.message || 'News API error');
                    }

                    if (data.articles.length === 0) {
                        return helpers.info(`No news found for "${topic}"`);
                    }

                    let msg = `📰 **Latest News: ${topic}**\n\n`;
                    data.articles.forEach((article, i) => {
                        msg += `${i + 1}. **${article.title}**\n`;
                        msg += `   ${article.source.name} - ${new Date(article.publishedAt).toLocaleDateString()}\n`;
                        msg += `   ${article.url}\n\n`;
                    });

                    return msg;
                } catch (error) {
                    return helpers.error(`News fetch failed: ${error.message}`);
                }
            },
        },
    },

    tools: {
        getNews: {
            description: 'Get latest news articles for a topic',
            parameters: {
                topic: {
                    type: 'string',
                    description: 'News topic to search for',
                },
            },
            execute: async (params, ctx) => {
                const apiKey = ctx.getConfig().plugins?.news?.apiKey;
                
                if (!apiKey) {
                    return { success: false, error: 'News API key not configured' };
                }

                try {
                    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(params.topic)}&sortBy=publishedAt&pageSize=5&apiKey=${apiKey}`;
                    const response = await fetch(url);
                    const data = await response.json();

                    if (data.status !== 'ok') {
                        return { success: false, error: data.message || 'News API error' };
                    }

                    return {
                        success: true,
                        count: data.articles.length,
                        articles: data.articles.map(article => ({
                            title: article.title,
                            source: article.source.name,
                            url: article.url,
                            publishedAt: article.publishedAt,
                            description: article.description,
                        })),
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },
    },
});

