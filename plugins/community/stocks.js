/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     STOCKS PLUGIN                              ║
 * ║                                                                 ║
 * ║   Get stock prices and market data (free API)                  ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const { Plugin, helpers } = require('../../src/plugins/sdk');
const fetch = require('node-fetch');

module.exports = new Plugin({
    name: 'stocks',
    description: 'Get stock prices and market data',
    version: '1.0.0',
    author: 'FreppeBot',

    commands: {
        stock: {
            description: 'Get stock price: !stock <symbol>',
            handler: async (ctx, args) => {
                if (args.length === 0) {
                    return helpers.error('Usage: !stock <symbol>\nExample: !stock AAPL');
                }

                const symbol = args[0].toUpperCase();

                try {
                    // Using Alpha Vantage free tier (or similar free API)
                    // For demo, using a simple approach - in production, use proper API
                    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
                    const data = await response.json();

                    if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
                        throw new Error('Stock symbol not found');
                    }

                    const result = data.chart.result[0];
                    const meta = result.meta;
                    const quote = result.indicators.quote[0];

                    const currentPrice = meta.regularMarketPrice;
                    const previousClose = meta.previousClose;
                    const change = currentPrice - previousClose;
                    const changePercent = ((change / previousClose) * 100).toFixed(2);

                    const changeEmoji = change >= 0 ? '📈' : '📉';
                    const changeSign = change >= 0 ? '+' : '';

                    return `${changeEmoji} **${symbol}** - ${meta.shortName || symbol}\n\n` +
                           `**Price:** $${currentPrice.toFixed(2)}\n` +
                           `**Change:** ${changeSign}$${change.toFixed(2)} (${changeSign}${changePercent}%)\n` +
                           `**Previous Close:** $${previousClose.toFixed(2)}`;
                } catch (error) {
                    return helpers.error(`Failed to get stock data: ${error.message}`);
                }
            },
        },
    },

    tools: {
        getStockPrice: {
            description: 'Get current stock price for a symbol',
            parameters: {
                symbol: {
                    type: 'string',
                    description: 'Stock symbol (e.g., AAPL, GOOGL, MSFT)',
                },
            },
            execute: async (params) => {
                try {
                    const symbol = params.symbol.toUpperCase();
                    const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`);
                    const data = await response.json();

                    if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
                        return { success: false, error: 'Stock symbol not found' };
                    }

                    const result = data.chart.result[0];
                    const meta = result.meta;
                    const previousClose = meta.previousClose;
                    const currentPrice = meta.regularMarketPrice;
                    const change = currentPrice - previousClose;
                    const changePercent = ((change / previousClose) * 100).toFixed(2);

                    return {
                        success: true,
                        symbol,
                        name: meta.shortName || symbol,
                        price: currentPrice,
                        change,
                        changePercent: parseFloat(changePercent),
                        previousClose,
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },
    },
});

