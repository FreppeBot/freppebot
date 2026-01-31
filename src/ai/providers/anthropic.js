/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     ANTHROPIC PROVIDER                         ║
 * ║                                                                 ║
 * ║   Direct access to Claude models                               ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../../utils/logger');

class AnthropicProvider {
    constructor(options) {
        this.client = new Anthropic({
            apiKey: options.apiKey,
        });
        this.defaultModel = options.defaultModel || 'claude-3-5-sonnet-20241022';
    }

    async chat(options) {
        const { messages, tools, model } = options;

        // Separate system message from other messages
        const systemMessage = messages.find(m => m.role === 'system');
        const otherMessages = messages.filter(m => m.role !== 'system');

        const requestBody = {
            model: model || this.defaultModel,
            max_tokens: 4096,
            messages: this.formatMessages(otherMessages),
        };

        if (systemMessage) {
            requestBody.system = systemMessage.content;
        }

        if (tools && tools.length > 0) {
            requestBody.tools = this.formatTools(tools);
        }

        logger.debug(`Anthropic request to ${requestBody.model}`);

        const response = await this.client.messages.create(requestBody);

        return {
            content: this.extractContent(response.content),
            toolCalls: this.parseToolCalls(response.content),
            usage: {
                prompt_tokens: response.usage.input_tokens,
                completion_tokens: response.usage.output_tokens,
            },
        };
    }

    formatMessages(messages) {
        const formatted = [];

        for (const msg of messages) {
            if (msg.role === 'tool') {
                // Tool results in Anthropic format
                formatted.push({
                    role: 'user',
                    content: [{
                        type: 'tool_result',
                        tool_use_id: msg.toolCallId,
                        content: msg.content,
                    }],
                });
            } else if (msg.toolCalls) {
                // Assistant message with tool calls
                const content = [];
                if (msg.content) {
                    content.push({ type: 'text', text: msg.content });
                }
                for (const tc of msg.toolCalls) {
                    content.push({
                        type: 'tool_use',
                        id: tc.id,
                        name: tc.name,
                        input: tc.arguments,
                    });
                }
                formatted.push({ role: 'assistant', content });
            } else {
                formatted.push({
                    role: msg.role,
                    content: msg.content,
                });
            }
        }

        return formatted;
    }

    formatTools(tools) {
        return tools.map(tool => ({
            name: tool.function.name,
            description: tool.function.description,
            input_schema: tool.function.parameters,
        }));
    }

    extractContent(content) {
        const textBlock = content.find(c => c.type === 'text');
        return textBlock ? textBlock.text : '';
    }

    parseToolCalls(content) {
        const toolUses = content.filter(c => c.type === 'tool_use');
        if (toolUses.length === 0) return null;

        return toolUses.map(tu => ({
            id: tu.id,
            name: tu.name,
            arguments: tu.input,
        }));
    }
}

module.exports = AnthropicProvider;
