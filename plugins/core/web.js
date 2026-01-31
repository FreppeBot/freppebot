/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     WEB PLUGIN                                 ║
 * ║                                                                 ║
 * ║   Fetch web content and make HTTP requests                     ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const { Plugin, helpers } = require('../../src/plugins/sdk');
const fetch = require('node-fetch');

module.exports = new Plugin({
    name: 'web',
    description: 'Fetch web content and make HTTP requests',
    version: '1.0.0',
    author: 'FreppeBot',

    commands: {
        fetch: {
            description: 'Fetch a URL: !fetch <url>',
            handler: async (ctx, args) => {
                if (args.length === 0) {
                    return helpers.error('Usage: !fetch <url>');
                }

                const url = args[0];

                try {
                    await ctx.sendTyping();

                    const response = await fetch(url, {
                        timeout: 10000,
                        headers: {
                            'User-Agent': 'FreppeBot/1.0',
                        },
                    });

                    const contentType = response.headers.get('content-type') || '';

                    if (contentType.includes('application/json')) {
                        const json = await response.json();
                        return helpers.code(JSON.stringify(json, null, 2), 'json');
                    } else if (contentType.includes('text/')) {
                        const text = await response.text();
                        return helpers.truncate(text, 1500);
                    } else {
                        return helpers.info(`Fetched ${url}\nStatus: ${response.status}\nContent-Type: ${contentType}`);
                    }
                } catch (error) {
                    return helpers.error(`Failed to fetch: ${error.message}`);
                }
            },
        },
    },

    tools: {
        fetchUrl: {
            description: 'Fetch content from a URL',
            parameters: {
                url: {
                    type: 'string',
                    description: 'The URL to fetch',
                },
                format: {
                    type: 'string',
                    description: 'Expected format: json, text, or headers',
                    enum: ['json', 'text', 'headers'],
                    required: false,
                },
            },
            execute: async (params) => {
                try {
                    const response = await fetch(params.url, {
                        timeout: 15000,
                        headers: {
                            'User-Agent': 'FreppeBot/1.0',
                        },
                    });

                    const headers = {};
                    response.headers.forEach((value, key) => {
                        headers[key] = value;
                    });

                    if (params.format === 'headers') {
                        return { success: true, status: response.status, headers };
                    }

                    const contentType = headers['content-type'] || '';

                    if (params.format === 'json' || contentType.includes('application/json')) {
                        const json = await response.json();
                        return { success: true, status: response.status, data: json };
                    }

                    const text = await response.text();
                    return {
                        success: true,
                        status: response.status,
                        content: helpers.truncate(text, 4000),
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },

        httpRequest: {
            description: 'Make an HTTP request with custom method and body',
            parameters: {
                url: {
                    type: 'string',
                    description: 'The URL to request',
                },
                method: {
                    type: 'string',
                    description: 'HTTP method',
                    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                },
                body: {
                    type: 'string',
                    description: 'Request body (JSON string for POST/PUT)',
                    required: false,
                },
                headers: {
                    type: 'object',
                    description: 'Custom headers as key-value pairs',
                    required: false,
                },
            },
            execute: async (params) => {
                try {
                    const options = {
                        method: params.method || 'GET',
                        timeout: 15000,
                        headers: {
                            'User-Agent': 'FreppeBot/1.0',
                            ...params.headers,
                        },
                    };

                    if (params.body && ['POST', 'PUT', 'PATCH'].includes(params.method)) {
                        options.body = params.body;
                        if (!options.headers['Content-Type']) {
                            options.headers['Content-Type'] = 'application/json';
                        }
                    }

                    const response = await fetch(params.url, options);

                    let data;
                    const contentType = response.headers.get('content-type') || '';

                    if (contentType.includes('application/json')) {
                        data = await response.json();
                    } else {
                        data = await response.text();
                    }

                    return {
                        success: true,
                        status: response.status,
                        statusText: response.statusText,
                        data: typeof data === 'string' ? helpers.truncate(data, 4000) : data,
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },
    },
});
