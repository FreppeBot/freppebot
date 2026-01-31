/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     REDDIT PLUGIN                             ║
 * ║                                                                 ║
 * ║   Search Reddit posts and get trending topics                  ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const { Plugin, helpers } = require('../../src/plugins/sdk');
const fetch = require('node-fetch');

module.exports = new Plugin({
    name: 'reddit',
    description: 'Search Reddit and get trending posts',
    version: '1.0.0',
    author: 'FreppeBot',

    commands: {
        reddit: {
            description: 'Search Reddit: !reddit <subreddit or query>',
            handler: async (ctx, args) => {
                if (args.length === 0) {
                    return helpers.error('Usage: !reddit <subreddit> or !reddit search <query>');
                }

                const input = args.join(' ');

                try {
                    // If it's a subreddit name (no spaces or starts with r/)
                    if (!input.includes(' ') || input.startsWith('r/')) {
                        const subreddit = input.startsWith('r/') ? input.slice(2) : input;
                        const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=5`;
                        
                        const response = await fetch(url, {
                            headers: { 'User-Agent': 'FreppeBot/1.0' },
                        });

                        if (!response.ok) {
                            throw new Error('Subreddit not found or inaccessible');
                        }

                        const data = await response.json();
                        const posts = data.data.children;

                        if (posts.length === 0) {
                            return helpers.info(`No posts found in r/${subreddit}`);
                        }

                        let msg = `🔥 **r/${subreddit} - Hot Posts**\n\n`;
                        posts.forEach((post, i) => {
                            const p = post.data;
                            msg += `${i + 1}. **${p.title}** (${p.ups} ⬆️)\n`;
                            msg += `   ${p.url}\n\n`;
                        });

                        return msg;
                    } else {
                        // Search query
                        const query = input.replace(/^search\s+/i, '');
                        const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=5`;
                        
                        const response = await fetch(url, {
                            headers: { 'User-Agent': 'FreppeBot/1.0' },
                        });

                        const data = await response.json();
                        const posts = data.data.children;

                        if (posts.length === 0) {
                            return helpers.info(`No results for "${query}"`);
                        }

                        let msg = `🔍 **Reddit Search: "${query}"**\n\n`;
                        posts.forEach((post, i) => {
                            const p = post.data;
                            msg += `${i + 1}. **${p.title}** (r/${p.subreddit}, ${p.ups} ⬆️)\n`;
                            msg += `   ${p.url}\n\n`;
                        });

                        return msg;
                    }
                } catch (error) {
                    return helpers.error(`Reddit search failed: ${error.message}`);
                }
            },
        },
    },

    tools: {
        searchReddit: {
            description: 'Search Reddit posts',
            parameters: {
                query: {
                    type: 'string',
                    description: 'Search query or subreddit name',
                },
            },
            execute: async (params) => {
                try {
                    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(params.query)}&limit=5`;
                    const response = await fetch(url, {
                        headers: { 'User-Agent': 'FreppeBot/1.0' },
                    });

                    if (!response.ok) {
                        return { success: false, error: 'Reddit API error' };
                    }

                    const data = await response.json();
                    const posts = data.data.children;

                    return {
                        success: true,
                        count: posts.length,
                        posts: posts.map(post => ({
                            title: post.data.title,
                            subreddit: post.data.subreddit,
                            upvotes: post.data.ups,
                            url: post.data.url,
                        })),
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },
    },
});

