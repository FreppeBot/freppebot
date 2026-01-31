/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     TWITTER/X PLUGIN                           ║
 * ║                                                                 ║
 * ║   Tweet, read timeline, get trends, and more!                  ║
 * ║                                                                 ║
 * ║   Features:                                                    ║
 * ║   - Get trending topics                                        ║
 * ║   - Post tweets                                                ║
 * ║   - Generate images and tweet them                             ║
 * ║   - Search tweets                                              ║
 * ╚═══════════════════════════════════════════════════════════════╝
 * 
 * Setup:
 * 1. Create a Twitter Developer account: https://developer.twitter.com
 * 2. Create an app and get your API keys
 * 3. Add to .env:
 *    TWITTER_API_KEY=...
 *    TWITTER_API_SECRET=...
 *    TWITTER_ACCESS_TOKEN=...
 *    TWITTER_ACCESS_SECRET=...
 */

const { Plugin, helpers } = require('../../src/plugins/sdk');
const crypto = require('crypto');
const fetch = require('node-fetch');

// Twitter API v2 base URL
const TWITTER_API = 'https://api.twitter.com/2';

// OAuth 1.0a helper for Twitter API
function createOAuthHeader(method, url, params = {}) {
    const apiKey = process.env.TWITTER_API_KEY;
    const apiSecret = process.env.TWITTER_API_SECRET;
    const accessToken = process.env.TWITTER_ACCESS_TOKEN;
    const accessSecret = process.env.TWITTER_ACCESS_SECRET;

    if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
        throw new Error('Twitter API credentials not configured in .env');
    }

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString('hex');

    const oauthParams = {
        oauth_consumer_key: apiKey,
        oauth_nonce: nonce,
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: timestamp,
        oauth_token: accessToken,
        oauth_version: '1.0',
        ...params,
    };

    // Create signature base string
    const sortedParams = Object.keys(oauthParams)
        .sort()
        .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(oauthParams[k])}`)
        .join('&');

    const baseString = `${method.toUpperCase()}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
    const signingKey = `${encodeURIComponent(apiSecret)}&${encodeURIComponent(accessSecret)}`;

    const signature = crypto
        .createHmac('sha1', signingKey)
        .update(baseString)
        .digest('base64');

    oauthParams.oauth_signature = signature;

    // Build Authorization header
    const authHeader =
        'OAuth ' +
        Object.keys(oauthParams)
            .filter(k => k.startsWith('oauth_'))
            .sort()
            .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
            .join(', ');

    return authHeader;
}

// Make authenticated Twitter API request
async function twitterRequest(method, endpoint, body = null) {
    const url = `${TWITTER_API}${endpoint}`;

    const headers = {
        Authorization: createOAuthHeader(method, url),
        'Content-Type': 'application/json',
    };

    const options = {
        method,
        headers,
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.detail || data.title || 'Twitter API error');
    }

    return data;
}

module.exports = new Plugin({
    name: 'twitter',
    description: 'Interact with Twitter/X - tweet, get trends, search, and more!',
    version: '1.0.0',
    author: 'FreppeBot',

    // Lifecycle hook - check for credentials on load
    onLoad: async () => {
        if (!process.env.TWITTER_API_KEY) {
            console.warn('⚠️  Twitter plugin: API credentials not configured');
        }
    },

    // Direct commands users can type
    commands: {
        tweet: {
            description: 'Post a tweet: !tweet <message>',
            handler: async (ctx, args) => {
                if (args.length === 0) {
                    return helpers.error('Usage: !tweet <message>');
                }

                const text = args.join(' ');

                if (text.length > 280) {
                    return helpers.error(`Tweet too long! ${text.length}/280 characters`);
                }

                try {
                    await ctx.sendTyping();
                    const result = await twitterRequest('POST', '/tweets', { text });
                    return helpers.success(`Tweet posted! 🐦\nhttps://twitter.com/i/status/${result.data.id}`);
                } catch (error) {
                    return helpers.error(`Failed to tweet: ${error.message}`);
                }
            },
        },

        trends: {
            description: 'Get trending topics: !trends [location]',
            handler: async (ctx, args) => {
                try {
                    await ctx.sendTyping();
                    // Note: Twitter API v2 trends require place ID
                    // For simplicity, using worldwide (WOEID: 1)
                    const woeid = args[0] || '1'; // Worldwide by default

                    // Using v1.1 endpoint for trends (still available)
                    const url = `https://api.twitter.com/1.1/trends/place.json?id=${woeid}`;
                    const response = await fetch(url, {
                        headers: {
                            Authorization: createOAuthHeader('GET', url),
                        },
                    });

                    const data = await response.json();

                    if (data.errors) {
                        throw new Error(data.errors[0].message);
                    }

                    const trends = data[0].trends.slice(0, 10);

                    let msg = `🔥 **Trending on Twitter**\n\n`;
                    trends.forEach((trend, i) => {
                        const volume = trend.tweet_volume
                            ? `(${(trend.tweet_volume / 1000).toFixed(1)}K tweets)`
                            : '';
                        msg += `${i + 1}. **${trend.name}** ${volume}\n`;
                    });

                    return msg;
                } catch (error) {
                    return helpers.error(`Failed to get trends: ${error.message}`);
                }
            },
        },

        search: {
            description: 'Search tweets: !search <query>',
            handler: async (ctx, args) => {
                if (args.length === 0) {
                    return helpers.error('Usage: !search <query>');
                }

                const query = args.join(' ');

                try {
                    await ctx.sendTyping();
                    const result = await twitterRequest(
                        'GET',
                        `/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=5&tweet.fields=author_id,created_at,public_metrics`
                    );

                    if (!result.data || result.data.length === 0) {
                        return helpers.info(`No tweets found for "${query}"`);
                    }

                    let msg = `🔍 **Tweets about "${query}"**\n\n`;
                    for (const tweet of result.data) {
                        const likes = tweet.public_metrics?.like_count || 0;
                        const retweets = tweet.public_metrics?.retweet_count || 0;
                        msg += `• ${helpers.truncate(tweet.text, 200)}\n`;
                        msg += `  _❤️ ${likes} | 🔄 ${retweets}_\n\n`;
                    }

                    return msg;
                } catch (error) {
                    return helpers.error(`Search failed: ${error.message}`);
                }
            },
        },
    },

    // Tools the AI can use automatically in conversation
    tools: {
        postTweet: {
            description: 'Post a tweet to Twitter/X',
            parameters: {
                text: {
                    type: 'string',
                    description: 'The tweet content (max 280 characters)',
                },
            },
            execute: async (params) => {
                if (params.text.length > 280) {
                    return {
                        success: false,
                        error: `Tweet too long: ${params.text.length}/280 characters`
                    };
                }

                try {
                    const result = await twitterRequest('POST', '/tweets', {
                        text: params.text
                    });
                    return {
                        success: true,
                        tweetId: result.data.id,
                        url: `https://twitter.com/i/status/${result.data.id}`,
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },

        getTrends: {
            description: 'Get current trending topics on Twitter',
            parameters: {
                location: {
                    type: 'string',
                    description: 'Location ID (WOEID). Default is worldwide.',
                    required: false,
                },
            },
            execute: async (params) => {
                try {
                    const woeid = params.location || '1';
                    const url = `https://api.twitter.com/1.1/trends/place.json?id=${woeid}`;

                    const response = await fetch(url, {
                        headers: {
                            Authorization: createOAuthHeader('GET', url),
                        },
                    });

                    const data = await response.json();

                    if (data.errors) {
                        throw new Error(data.errors[0].message);
                    }

                    const trends = data[0].trends.slice(0, 10).map(t => ({
                        name: t.name,
                        tweetVolume: t.tweet_volume,
                        url: t.url,
                    }));

                    return { success: true, trends };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },

        searchTweets: {
            description: 'Search for recent tweets about a topic',
            parameters: {
                query: {
                    type: 'string',
                    description: 'Search query',
                },
                count: {
                    type: 'number',
                    description: 'Number of tweets to return (max 10)',
                    required: false,
                },
            },
            execute: async (params) => {
                try {
                    const count = Math.min(params.count || 5, 10);
                    const result = await twitterRequest(
                        'GET',
                        `/tweets/search/recent?query=${encodeURIComponent(params.query)}&max_results=${count}&tweet.fields=author_id,created_at,public_metrics`
                    );

                    if (!result.data) {
                        return { success: true, tweets: [], message: 'No tweets found' };
                    }

                    const tweets = result.data.map(t => ({
                        id: t.id,
                        text: t.text,
                        likes: t.public_metrics?.like_count || 0,
                        retweets: t.public_metrics?.retweet_count || 0,
                    }));

                    return { success: true, tweets };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },

        postTweetWithImage: {
            description: 'Post a tweet with an image. First generate the image, then post it.',
            parameters: {
                text: {
                    type: 'string',
                    description: 'The tweet text (max 280 characters)',
                },
                imageUrl: {
                    type: 'string',
                    description: 'URL of the image to attach',
                },
            },
            execute: async (params) => {
                try {
                    // First, upload the image to Twitter
                    // Note: This requires the media upload endpoint
                    const imageResponse = await fetch(params.imageUrl);
                    const imageBuffer = await imageResponse.buffer();
                    const base64Image = imageBuffer.toString('base64');

                    // Upload to Twitter media
                    const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';
                    const mediaResponse = await fetch(uploadUrl, {
                        method: 'POST',
                        headers: {
                            Authorization: createOAuthHeader('POST', uploadUrl),
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body: `media_data=${encodeURIComponent(base64Image)}`,
                    });

                    const mediaData = await mediaResponse.json();

                    if (!mediaData.media_id_string) {
                        throw new Error('Failed to upload image');
                    }

                    // Now post the tweet with media
                    const result = await twitterRequest('POST', '/tweets', {
                        text: params.text,
                        media: {
                            media_ids: [mediaData.media_id_string],
                        },
                    });

                    return {
                        success: true,
                        tweetId: result.data.id,
                        url: `https://twitter.com/i/status/${result.data.id}`,
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },

        generateQuote: {
            description: 'Generate an inspirational or funny quote (can be used before tweeting)',
            parameters: {
                style: {
                    type: 'string',
                    description: 'Quote style: inspirational, funny, tech, wisdom',
                    enum: ['inspirational', 'funny', 'tech', 'wisdom'],
                },
            },
            execute: async (params, ctx) => {
                // Use the AI to generate a quote
                const ai = ctx.getAI();
                const prompt = `Generate a short, original ${params.style} quote suitable for Twitter (under 200 characters). Just the quote, no attribution or hashtags.`;

                const quote = await ai.complete(prompt);
                return { success: true, quote: quote.trim() };
            },
        },
    },
});
