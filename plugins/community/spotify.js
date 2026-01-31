/**
 * 🎵 SPOTIFY/MUSIC PLUGIN
 * 
 * Search songs, get recommendations, control playback
 * Requires Spotify API credentials (free tier works!)
 * 
 * Setup:
 * 1. Go to https://developer.spotify.com/dashboard
 * 2. Create an app, get Client ID and Secret
 * 3. Add to config.json under plugins.spotify
 * 
 * Commands: !song <query>, !artist <name>
 * AI Tools: searchMusic, getRecommendations
 */

const { Plugin, helpers } = require('../../src/plugins/sdk');
const fetch = require('node-fetch');

let accessToken = null;
let tokenExpiry = 0;

async function getAccessToken(config) {
    if (accessToken && Date.now() < tokenExpiry) {
        return accessToken;
    }

    const clientId = config?.clientId || process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = config?.clientSecret || process.env.SPOTIFY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('Spotify credentials not configured');
    }

    const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        },
        body: 'grant_type=client_credentials',
    });

    const data = await response.json();
    accessToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
    return accessToken;
}

async function spotifyRequest(endpoint, config) {
    const token = await getAccessToken(config);
    const response = await fetch(`https://api.spotify.com/v1${endpoint}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    return response.json();
}

module.exports = new Plugin({
    name: 'spotify',
    description: 'Search music and get recommendations from Spotify',
    version: '1.0.0',

    commands: {
        song: {
            description: 'Search for a song: !song <query>',
            handler: async (ctx, args) => {
                if (args.length === 0) return '🎵 Usage: !song <query>';

                try {
                    const query = args.join(' ');
                    const data = await spotifyRequest(`/search?q=${encodeURIComponent(query)}&type=track&limit=3`);

                    if (!data.tracks?.items?.length) {
                        return `No songs found for "${query}"`;
                    }

                    let msg = `🎵 **Songs matching "${query}"**\n\n`;
                    for (const track of data.tracks.items) {
                        const artists = track.artists.map(a => a.name).join(', ');
                        msg += `• **${track.name}** by ${artists}\n`;
                        msg += `  ${track.external_urls.spotify}\n\n`;
                    }
                    return msg;
                } catch (error) {
                    return `❌ ${error.message}`;
                }
            },
        },

        artist: {
            description: 'Search for an artist: !artist <name>',
            handler: async (ctx, args) => {
                if (args.length === 0) return '🎤 Usage: !artist <name>';

                try {
                    const query = args.join(' ');
                    const data = await spotifyRequest(`/search?q=${encodeURIComponent(query)}&type=artist&limit=1`);

                    if (!data.artists?.items?.length) {
                        return `Artist not found: "${query}"`;
                    }

                    const artist = data.artists.items[0];
                    return `🎤 **${artist.name}**
👥 ${artist.followers.total.toLocaleString()} followers
🎭 ${artist.genres.slice(0, 3).join(', ') || 'No genres listed'}
🔗 ${artist.external_urls.spotify}`;
                } catch (error) {
                    return `❌ ${error.message}`;
                }
            },
        },
    },

    tools: {
        searchMusic: {
            description: 'Search for songs, artists, or albums on Spotify',
            parameters: {
                query: {
                    type: 'string',
                    description: 'Search query',
                },
                type: {
                    type: 'string',
                    description: 'Type: track, artist, album',
                    enum: ['track', 'artist', 'album'],
                    required: false,
                },
            },
            execute: async (params, ctx) => {
                try {
                    const type = params.type || 'track';
                    const config = ctx.bot?.getConfig()?.plugins?.spotify;
                    const data = await spotifyRequest(
                        `/search?q=${encodeURIComponent(params.query)}&type=${type}&limit=5`,
                        config
                    );

                    const key = type + 's';
                    if (!data[key]?.items?.length) {
                        return { results: [], message: 'No results found' };
                    }

                    const results = data[key].items.map(item => ({
                        name: item.name,
                        url: item.external_urls.spotify,
                        ...(type === 'track' ? { artist: item.artists[0].name } : {}),
                        ...(type === 'artist' ? { followers: item.followers.total } : {}),
                    }));

                    return { results };
                } catch (error) {
                    return { error: error.message };
                }
            },
        },

        getTopTracks: {
            description: 'Get top tracks for an artist',
            parameters: {
                artist: {
                    type: 'string',
                    description: 'Artist name',
                },
            },
            execute: async (params, ctx) => {
                try {
                    const config = ctx.bot?.getConfig()?.plugins?.spotify;

                    // First search for artist
                    const search = await spotifyRequest(
                        `/search?q=${encodeURIComponent(params.artist)}&type=artist&limit=1`,
                        config
                    );

                    if (!search.artists?.items?.length) {
                        return { error: 'Artist not found' };
                    }

                    const artistId = search.artists.items[0].id;
                    const tracks = await spotifyRequest(`/artists/${artistId}/top-tracks?market=US`, config);

                    return {
                        artist: search.artists.items[0].name,
                        tracks: tracks.tracks.slice(0, 5).map(t => ({
                            name: t.name,
                            url: t.external_urls.spotify,
                        })),
                    };
                } catch (error) {
                    return { error: error.message };
                }
            },
        },
    },
});
