/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     OPENROUTER PROVIDER                        ║
 * ║                                                                 ║
 * ║   Access 100+ models through one API - recommended provider!   ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const fetch = require('node-fetch');
const logger = require('../../utils/logger');
const { retry } = require('../../utils/retry');
const { withTimeout } = require('../../utils/timeout');

class OpenRouterProvider {
    constructor(options) {
        this.apiKey = options.apiKey;
        this.defaultModel = options.defaultModel || 'anthropic/claude-3.5-sonnet';
        this.baseUrl = 'https://openrouter.ai/api/v1';
    }

    async chat(options) {
        const { messages, tools, model } = options;

        const requestBody = {
            model: model || this.defaultModel,
            messages: this.formatMessages(messages),
        };

        if (tools && tools.length > 0) {
            requestBody.tools = tools;
            requestBody.tool_choice = 'auto';
        }

        logger.debug(`OpenRouter request to ${requestBody.model}`);

        // Add timeout and retry logic
        const makeRequest = async () => {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                    'HTTP-Referer': 'https://github.com/freppebot',
                    'X-Title': 'FreppeBot',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const error = await response.text();
                const errorObj = new Error(`OpenRouter error: ${response.status} - ${error}`);
                errorObj.status = response.status;
                throw errorObj;
            }

            return response;
        };

        // Retry with timeout (60 seconds for AI requests)
        const response = await retry(
            () => withTimeout(makeRequest(), 60000, 'OpenRouter request timed out'),
            {
                maxRetries: 2,
                initialDelay: 1000,
                shouldRetry: (error) => {
                    // Retry on network errors and 5xx errors
                    if (error.message.includes('timed out')) return true;
                    if (error.status >= 500) return true;
                    return false;
                },
            }
        );

        const data = await response.json();
        const choice = data.choices[0];

        return {
            content: choice.message.content || '',
            toolCalls: this.parseToolCalls(choice.message.tool_calls),
            usage: data.usage,
        };
    }

    formatMessages(messages) {
        return messages.map(msg => {
            if (msg.role === 'tool') {
                return {
                    role: 'tool',
                    tool_call_id: msg.toolCallId,
                    content: msg.content,
                };
            }

            const formatted = {
                role: msg.role,
                content: msg.content,
            };

            if (msg.toolCalls) {
                formatted.tool_calls = msg.toolCalls.map(tc => ({
                    id: tc.id,
                    type: 'function',
                    function: {
                        name: tc.name,
                        arguments: JSON.stringify(tc.arguments),
                    },
                }));
            }

            return formatted;
        });
    }

    parseToolCalls(toolCalls) {
        if (!toolCalls) return null;

        return toolCalls.map(tc => ({
            id: tc.id,
            name: tc.function.name,
            arguments: JSON.parse(tc.function.arguments || '{}'),
        }));
    }
}

module.exports = OpenRouterProvider;
