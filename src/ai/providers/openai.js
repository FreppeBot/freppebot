/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     OPENAI PROVIDER                            ║
 * ║                                                                 ║
 * ║   Direct access to GPT-4, GPT-4o, etc.                         ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const OpenAI = require('openai');
const logger = require('../../utils/logger');

class OpenAIProvider {
    constructor(options) {
        this.client = new OpenAI({
            apiKey: options.apiKey,
        });
        this.defaultModel = options.defaultModel || 'gpt-4o';
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

        logger.debug(`OpenAI request to ${requestBody.model}`);

        const response = await this.client.chat.completions.create(requestBody);
        const choice = response.choices[0];

        return {
            content: choice.message.content || '',
            toolCalls: this.parseToolCalls(choice.message.tool_calls),
            usage: response.usage,
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

module.exports = OpenAIProvider;
