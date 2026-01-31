/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                    KIMI / MOONSHOT PROVIDER                    ║
 * ║          https://platform.moonshot.cn/                         ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const fetch = require('node-fetch');
const logger = require('../../utils/logger');

const KIMI_API_URL = 'https://api.moonshot.ai/v1';

class KimiProvider {
    constructor(config) {
        this.apiKey = config.kimiKey;
        this.model = config.defaultModel || 'moonshot-v1-32k';

        // Debug: log if API key is present
        if (this.apiKey) {
            logger.debug(`Kimi provider initialized with model: ${this.model}`);
        } else {
            logger.warn('Kimi provider: No API key provided!');
        }
    }

    /**
     * Format messages for Kimi API (OpenAI-compatible format)
     */
    formatMessages(messages) {
        return messages.map(msg => {
            const formatted = {
                role: msg.role,
                content: msg.content || '',
            };

            // Handle tool calls in assistant messages
            if (msg.toolCalls) {
                formatted.tool_calls = msg.toolCalls.map(tc => ({
                    id: tc.id,
                    type: 'function',
                    function: {
                        name: tc.name,
                        arguments: typeof tc.arguments === 'string'
                            ? tc.arguments
                            : JSON.stringify(tc.arguments),
                    },
                }));
            }

            // Handle tool results
            if (msg.role === 'tool') {
                formatted.tool_call_id = msg.toolCallId;
                formatted.name = msg.name;
            }

            return formatted;
        });
    }

    /**
     * Convert tool definitions to Kimi format (OpenAI-compatible)
     */
    formatTools(tools) {
        if (!tools || tools.length === 0) return undefined;

        return tools.map(tool => {
            // Sanitize name: must start with letter, only letters/numbers/underscores/dashes
            let safeName = tool.name.replace(/[^a-zA-Z0-9_-]/g, '_');
            if (!/^[a-zA-Z]/.test(safeName)) {
                safeName = 'fn_' + safeName;
            }

            return {
                type: 'function',
                function: {
                    name: safeName,
                    description: tool.description,
                    parameters: {
                        type: 'object',
                        properties: tool.parameters || {},
                        required: Object.entries(tool.parameters || {})
                            .filter(([_, v]) => v.required !== false)
                            .map(([k]) => k),
                    },
                },
            };
        });
    }

    /**
     * Send chat request to Kimi
     */
    async chat({ messages, tools, model }) {
        const formattedMessages = this.formatMessages(messages);
        const formattedTools = this.formatTools(tools);
        const useModel = model || this.model;

        const body = {
            model: useModel,
            messages: formattedMessages,
            temperature: 1,
        };

        if (formattedTools && formattedTools.length > 0) {
            body.tools = formattedTools;
            body.tool_choice = 'auto';
        }

        logger.debug(`Kimi request: model=${useModel}, messages=${messages.length}`);

        const response = await fetch(`${KIMI_API_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Kimi API error: ${error}`);
        }

        const data = await response.json();
        const choice = data.choices[0];
        const assistantMessage = choice.message;

        // Return in the format expected by AIManager
        const result = {
            content: assistantMessage.content || '',
            toolCalls: null,
        };

        // Handle tool calls
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
            result.toolCalls = assistantMessage.tool_calls.map(tc => ({
                id: tc.id,
                name: tc.function.name,
                arguments: JSON.parse(tc.function.arguments || '{}'),
            }));
        }

        return result;
    }
}

module.exports = KimiProvider;
