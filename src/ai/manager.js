/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     AI PROVIDER MANAGER                        ║
 * ║                                                                 ║
 * ║   Abstracts different AI providers (OpenRouter, OpenAI, etc)   ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const OpenRouterProvider = require('./providers/openrouter');
const OpenAIProvider = require('./providers/openai');
const AnthropicProvider = require('./providers/anthropic');
const KimiProvider = require('./providers/kimi');
const logger = require('../utils/logger');

class AIManager {
    constructor(config) {
        this.config = config;
        this.providers = {};
        this.defaultProvider = config.defaultProvider || 'openrouter';
    }

    async initialize() {
        // Initialize OpenRouter if configured
        if (this.config.openrouterKey) {
            this.providers.openrouter = new OpenRouterProvider({
                apiKey: this.config.openrouterKey,
                defaultModel: this.config.defaultModel,
            });
            logger.info('  → OpenRouter provider ready');
        }

        // Initialize OpenAI if configured
        if (this.config.openaiKey) {
            this.providers.openai = new OpenAIProvider({
                apiKey: this.config.openaiKey,
                defaultModel: this.config.defaultModel,
            });
            logger.info('  → OpenAI provider ready');
        }

        // Initialize Anthropic if configured
        if (this.config.anthropicKey) {
            this.providers.anthropic = new AnthropicProvider({
                apiKey: this.config.anthropicKey,
                defaultModel: this.config.defaultModel,
            });
            logger.info('  → Anthropic provider ready');
        }

        // Initialize Kimi/Moonshot if configured
        if (this.config.kimiKey) {
            this.providers.kimi = new KimiProvider({
                kimiKey: this.config.kimiKey,
                defaultModel: this.config.defaultModel,
            });
            logger.info('  → Kimi/Moonshot provider ready');
        }

        if (Object.keys(this.providers).length === 0) {
            throw new Error('No AI providers configured! Run `npm run setup` to configure.');
        }

        if (!this.providers[this.defaultProvider]) {
            // Fall back to first available provider
            this.defaultProvider = Object.keys(this.providers)[0];
            logger.warn(`Default provider not available, using: ${this.defaultProvider}`);
        }
    }

    /**
     * Get the default provider
     */
    getProvider(name = null) {
        const providerName = name || this.defaultProvider;
        const provider = this.providers[providerName];

        if (!provider) {
            throw new Error(`Provider not available: ${providerName}`);
        }

        return provider;
    }

    /**
     * Chat with AI, handling tool calls
     */
    async chat(options) {
        const { messages, tools, onToolCall, model } = options;

        // Try default provider first, fallback to others on error
        let response;
        let activeProvider = null; // Store the provider that worked
        const requestedProvider = options.provider || this.defaultProvider;
        const providersToTry = [
            requestedProvider,
            ...Object.keys(this.providers).filter(p => p !== requestedProvider)
        ];

        let lastError;
        for (const providerName of providersToTry) {
            try {
                if (!this.providers[providerName]) {
                    continue; // Skip if provider not available
                }
                activeProvider = this.providers[providerName];
                response = await activeProvider.chat({
                    messages,
                    tools: tools && tools.length > 0 ? tools : undefined,
                    model,
                });
                if (providerName !== requestedProvider) {
                    logger.info(`Using fallback provider: ${providerName} (requested: ${requestedProvider})`);
                }
                break; // Success, exit loop
            } catch (error) {
                lastError = error;
                logger.warn(`Provider ${providerName} failed: ${error.message}`);
                if (providerName === providersToTry[providersToTry.length - 1]) {
                    // Last provider, throw error
                    throw lastError;
                }
            }
        }

        if (!response || !activeProvider) {
            throw lastError || new Error('No providers available');
        }

        // Handle tool calls if present
        while (response.toolCalls && response.toolCalls.length > 0) {
            const toolResults = [];

            for (const toolCall of response.toolCalls) {
                logger.debug(`AI wants to call tool: ${toolCall.name}`);

                let result;
                if (onToolCall) {
                    result = await onToolCall(toolCall);
                } else {
                    result = { error: 'Tool execution not available' };
                }

                toolResults.push({
                    toolCallId: toolCall.id,
                    name: toolCall.name,
                    result: JSON.stringify(result),
                });
            }

            // Continue conversation with tool results using the same provider
            response = await activeProvider.chat({
                messages: [
                    ...messages,
                    { role: 'assistant', content: response.content, toolCalls: response.toolCalls },
                    ...toolResults.map(r => ({
                        role: 'tool',
                        toolCallId: r.toolCallId,
                        name: r.name,
                        content: r.result,
                    })),
                ],
                tools,
                model,
            });
        }

        return response.content || '✓ Done';
    }

    /**
     * Simple completion without tools
     */
    async complete(prompt, options = {}) {
        const provider = this.getProvider(options.provider);

        const response = await provider.chat({
            messages: [{ role: 'user', content: prompt }],
            model: options.model,
        });

        return response.content;
    }
}

module.exports = AIManager;
