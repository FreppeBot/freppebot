/**
 * 💰 CRYPTO & STOCKS PLUGIN
 * 
 * Get crypto prices from CoinGecko (FREE, no API key needed!)
 * 
 * Commands: !price <coin>, !crypto <coin>
 * AI Tools: getCryptoPrice, getMultiplePrices
 */

const { Plugin, helpers } = require('../../src/plugins/sdk');
const fetch = require('node-fetch');

const COINGECKO_URL = 'https://api.coingecko.com/api/v3';

// Common coin aliases
const coinAliases = {
    btc: 'bitcoin',
    eth: 'ethereum',
    sol: 'solana',
    doge: 'dogecoin',
    xrp: 'ripple',
    ada: 'cardano',
    dot: 'polkadot',
    matic: 'polygon',
    link: 'chainlink',
    avax: 'avalanche-2',
    shib: 'shiba-inu',
    ltc: 'litecoin',
    uni: 'uniswap',
    atom: 'cosmos',
    bnb: 'binancecoin',
};

function resolveCoinId(input) {
    const lower = input.toLowerCase();
    return coinAliases[lower] || lower;
}

function formatPrice(price) {
    if (price >= 1) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (price >= 0.01) return `$${price.toFixed(4)}`;
    return `$${price.toFixed(8)}`;
}

function formatChange(change) {
    const sign = change >= 0 ? '+' : '';
    const emoji = change >= 0 ? '📈' : '📉';
    return `${emoji} ${sign}${change.toFixed(2)}%`;
}

async function getPrice(coinId) {
    const url = `${COINGECKO_URL}/simple/price?ids=${coinId}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data[coinId]) {
        throw new Error(`Coin not found: ${coinId}`);
    }

    return {
        id: coinId,
        price: data[coinId].usd,
        change24h: data[coinId].usd_24h_change,
        marketCap: data[coinId].usd_market_cap,
    };
}

async function getTrending() {
    const url = `${COINGECKO_URL}/search/trending`;
    const response = await fetch(url);
    const data = await response.json();
    return data.coins.slice(0, 7).map(c => ({
        name: c.item.name,
        symbol: c.item.symbol,
        rank: c.item.market_cap_rank,
    }));
}

module.exports = new Plugin({
    name: 'crypto',
    description: 'Get crypto prices from CoinGecko (free)',
    version: '1.0.0',

    commands: {
        price: {
            description: 'Get crypto price: !price btc',
            handler: async (ctx, args) => {
                if (args.length === 0) {
                    return '💰 Usage: !price <coin> (e.g., !price btc)';
                }

                try {
                    const coinId = resolveCoinId(args[0]);
                    const data = await getPrice(coinId);

                    return `**${coinId.toUpperCase()}**
${formatPrice(data.price)}
${formatChange(data.change24h)} (24h)`;
                } catch (error) {
                    return `❌ ${error.message}`;
                }
            },
        },

        trending: {
            description: 'Show trending coins',
            handler: async () => {
                try {
                    const coins = await getTrending();
                    let msg = '🔥 **Trending Coins**\n';
                    coins.forEach((coin, i) => {
                        msg += `${i + 1}. ${coin.name} (${coin.symbol})\n`;
                    });
                    return msg;
                } catch (error) {
                    return `❌ ${error.message}`;
                }
            },
        },
    },

    tools: {
        getCryptoPrice: {
            description: 'Get current price of a cryptocurrency',
            parameters: {
                coin: {
                    type: 'string',
                    description: 'Coin name or symbol (btc, eth, sol, etc.)',
                },
            },
            execute: async (params) => {
                try {
                    const coinId = resolveCoinId(params.coin);
                    const data = await getPrice(coinId);
                    return {
                        coin: coinId,
                        price: data.price,
                        priceFormatted: formatPrice(data.price),
                        change24h: data.change24h,
                        marketCap: data.marketCap,
                    };
                } catch (error) {
                    return { error: error.message };
                }
            },
        },

        getTrendingCrypto: {
            description: 'Get trending cryptocurrencies',
            parameters: {},
            execute: async () => {
                try {
                    const coins = await getTrending();
                    return { trending: coins };
                } catch (error) {
                    return { error: error.message };
                }
            },
        },
    },
});
