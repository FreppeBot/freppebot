/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                 FREPPEBOT INTERACTIVE SETUP                    ║
 * ║                                                                 ║
 * ║   Run with: npm run setup                                      ║
 * ║   Creates config.json with all your settings                  ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const inquirer = require('inquirer');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const CONFIG_PATH = path.join(process.cwd(), 'config.json');

/**
 * Fetch available models from OpenRouter
 */
async function fetchOpenRouterModels() {
    try {
        const response = await fetch('https://openrouter.ai/api/v1/models');
        if (!response.ok) {
            throw new Error('Failed to fetch models');
        }
        const data = await response.json();
        
        // Filter and format models
        const models = data.data
            .filter(model => model.id && !model.id.includes('deprecated'))
            .map(model => ({
                name: `${model.name || model.id}${model.pricing ? ` ($${model.pricing.prompt}/1M tokens)` : ''}`,
                value: model.id,
                description: model.description || '',
            }))
            .sort((a, b) => {
                // Sort popular models first
                const popular = ['claude-sonnet-4.5', 'claude-opus-4.5', 'gpt-5.2', 'gpt-4o', 'claude-3.5-sonnet'];
                const aIndex = popular.findIndex(p => a.value.includes(p));
                const bIndex = popular.findIndex(p => b.value.includes(p));
                if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
                if (aIndex !== -1) return -1;
                if (bIndex !== -1) return 1;
                return a.name.localeCompare(b.name);
            });

        return models;
    } catch (error) {
        console.log(chalk.yellow(`⚠ Could not fetch OpenRouter models: ${error.message}`));
        console.log(chalk.gray('Using default model list...\n'));
        return null;
    }
}


async function main() {
    printBanner();

    console.log(chalk.cyan('Welcome to FreppeBot Setup! 🤖\n'));
    console.log(chalk.gray('This wizard will help you configure your bot.\n'));

    // Load existing config if exists
    let existingConfig = null;
    if (fs.existsSync(CONFIG_PATH)) {
        try {
            existingConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
            console.log(chalk.green('✓ Found existing config.json\n'));
            
            // Ask what to configure
            const { setupMode } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'setupMode',
                    message: 'What would you like to do?',
                    choices: [
                        { name: 'Full setup (configure everything)', value: 'full' },
                        { name: 'Quick edit (only change specific sections)', value: 'quick' },
                    ],
                },
            ]);

            if (setupMode === 'quick') {
                const { sections } = await inquirer.prompt([
                    {
                        type: 'checkbox',
                        name: 'sections',
                        message: 'Which sections do you want to configure?',
                        choices: [
                            { name: 'Bot Settings (name, prefix, log level)', value: 'bot' },
                            { name: 'Bot Personality', value: 'personality' },
                            { name: 'AI Provider & Model', value: 'ai' },
                            { name: 'Messaging Platforms (Discord/Telegram)', value: 'platforms' },
                            { name: 'Optional Integrations (Twitter, Spotify, etc.)', value: 'plugins' },
                            { name: 'Plugin Settings', value: 'pluginSettings' },
                        ],
                        validate: (input) => input.length > 0 || 'Select at least one section',
                    },
                ]);
                
                // Only configure selected sections
                const config = {
                    bot: existingConfig?.bot || {},
                    ai: existingConfig?.ai || {},
                    platforms: existingConfig?.platforms || {},
                    plugins: existingConfig?.plugins || {},
                    security: existingConfig?.security || {},
                };

                // Helper to get existing value (local scope)
                const getExistingLocal = (path, defaultVal) => {
                    if (!existingConfig) return defaultVal;
                    const parts = path.split('.');
                    let val = existingConfig;
                    for (const part of parts) {
                        val = val?.[part];
                    }
                    return val !== undefined ? val : defaultVal;
                };

                if (sections.includes('bot')) {
                    console.log(chalk.cyan('\n📋 Bot Settings\n'));
                    const botSettings = await inquirer.prompt([
                        {
                            type: 'input',
                            name: 'name',
                            message: 'Bot name:',
                            default: getExistingLocal('bot.name', 'FreppeBot'),
                        },
                        {
                            type: 'input',
                            name: 'prefix',
                            message: 'Command prefix:',
                            default: getExistingLocal('bot.commandPrefix', '!'),
                        },
                        {
                            type: 'list',
                            name: 'logLevel',
                            message: 'Log level:',
                            choices: ['error', 'warn', 'info', 'debug'],
                            default: getExistingLocal('bot.logLevel', 'info'),
                        },
                    ]);
                    config.bot = { ...config.bot, ...botSettings, commandPrefix: botSettings.prefix };
                }

                if (sections.includes('personality')) {
                    console.log(chalk.cyan('\n🎭 Bot Personality\n'));
                    const personality = await inquirer.prompt([
                        {
                            type: 'list',
                            name: 'style',
                            message: 'Response style:',
                            choices: [
                                { name: 'Short & concise', value: 'concise' },
                                { name: 'Balanced', value: 'balanced' },
                                { name: 'Detailed', value: 'detailed' },
                            ],
                            default: getExistingLocal('bot.personality.style', 'concise'),
                        },
                        {
                            type: 'list',
                            name: 'tone',
                            message: 'Tone:',
                            choices: [
                                { name: 'Professional', value: 'professional' },
                                { name: 'Friendly', value: 'friendly' },
                                { name: 'Witty', value: 'witty' },
                                { name: 'Chill', value: 'chill' },
                                { name: 'Sarcastic', value: 'sarcastic' },
                            ],
                            default: getExistingLocal('bot.personality.tone', 'friendly'),
                        },
                        {
                            type: 'confirm',
                            name: 'useEmojis',
                            message: 'Use emojis?',
                            default: getExistingLocal('bot.personality.useEmojis', true),
                        },
                        {
                            type: 'input',
                            name: 'identity',
                            message: 'Bot identity:',
                            default: getExistingLocal('bot.personality.identity', `a helpful AI assistant named ${config.bot.name || 'FreppeBot'}`),
                        },
                    ]);
                    config.bot.personality = { ...config.bot.personality, ...personality };
                }

                if (sections.includes('ai')) {
                    console.log(chalk.cyan('\n🧠 AI Provider Settings\n'));
                    const aiProvider = await inquirer.prompt([
                        {
                            type: 'list',
                            name: 'provider',
                            message: 'AI Provider:',
                            choices: [
                                { name: 'OpenRouter (Recommended)', value: 'openrouter' },
                                { name: 'OpenAI', value: 'openai' },
                                { name: 'Anthropic', value: 'anthropic' },
                                { name: 'Kimi', value: 'kimi' },
                            ],
                            default: getExistingLocal('ai.defaultProvider', 'openrouter'),
                        },
                    ]);

                    config.ai.defaultProvider = aiProvider.provider;

                    if (aiProvider.provider === 'openrouter') {
                        const existingKey = getExistingLocal('ai.openrouterKey', '');
                        const { apiKey } = await inquirer.prompt([
                            {
                                type: 'password',
                                name: 'apiKey',
                                message: existingKey ? 'OpenRouter API key (Enter to keep):' : 'Enter OpenRouter API key:',
                                mask: '*',
                                default: existingKey,
                                validate: (input) => !input && existingKey ? true : input.length > 0 || 'API key required',
                            },
                        ]);
                        config.ai.openrouterKey = apiKey || existingKey;

                        console.log(chalk.gray('\n  Fetching models from OpenRouter...'));
                        let modelChoices = await fetchOpenRouterModels();
                        if (!modelChoices || modelChoices.length === 0) {
                            modelChoices = [
                                { name: 'Claude Sonnet 4.5 (Recommended)', value: 'anthropic/claude-sonnet-4.5' },
                                { name: 'Claude Opus 4.5', value: 'anthropic/claude-opus-4.5' },
                                { name: 'GPT-5.2', value: 'openai/gpt-5.2' },
                                { name: 'GPT-5.2 Pro', value: 'openai/gpt-5.2-pro' },
                            ];
                        }
                        const { model } = await inquirer.prompt([
                            {
                                type: 'list',
                                name: 'model',
                                message: 'Which model?',
                                choices: modelChoices,
                                default: getExistingLocal('ai.defaultModel', modelChoices[0]?.value || 'anthropic/claude-sonnet-4.5'),
                                pageSize: 15,
                            },
                        ]);
                        config.ai.defaultModel = model;
                    } else if (aiProvider.provider === 'openai') {
                        const existingKey = getExistingLocal('ai.openaiKey', '');
                        const { apiKey, model } = await inquirer.prompt([
                            {
                                type: 'password',
                                name: 'apiKey',
                                message: existingKey ? 'OpenAI API key (Enter to keep):' : 'Enter OpenAI API key:',
                                mask: '*',
                                default: existingKey,
                                validate: (input) => !input && existingKey ? true : input.length > 0 || 'API key required',
                            },
                            {
                                type: 'list',
                                name: 'model',
                                message: 'Which model?',
                                choices: [
                                    { name: 'GPT-5.2 Pro (Recommended)', value: 'gpt-5.2-pro' },
                                    { name: 'GPT-5.2', value: 'gpt-5.2' },
                                    { name: 'GPT-4o', value: 'gpt-4o' },
                                ],
                                default: getExistingLocal('ai.defaultModel', 'gpt-5.2-pro'),
                            },
                        ]);
                        config.ai.openaiKey = apiKey || existingKey;
                        config.ai.defaultModel = model;
                    } else if (aiProvider.provider === 'anthropic') {
                        const existingKey = getExistingLocal('ai.anthropicKey', '');
                        const { apiKey, model } = await inquirer.prompt([
                            {
                                type: 'password',
                                name: 'apiKey',
                                message: existingKey ? 'Anthropic API key (Enter to keep):' : 'Enter Anthropic API key:',
                                mask: '*',
                                default: existingKey,
                                validate: (input) => !input && existingKey ? true : input.length > 0 || 'API key required',
                            },
                            {
                                type: 'list',
                                name: 'model',
                                message: 'Which model?',
                                choices: [
                                    { name: 'Claude Sonnet 4.5 (Recommended)', value: 'claude-sonnet-4.5' },
                                    { name: 'Claude Opus 4.5', value: 'claude-opus-4.5' },
                                ],
                                default: getExistingLocal('ai.defaultModel', 'claude-sonnet-4.5'),
                            },
                        ]);
                        config.ai.anthropicKey = apiKey || existingKey;
                        config.ai.defaultModel = model;
                    } else if (aiProvider.provider === 'kimi') {
                        const existingKey = getExistingLocal('ai.kimiKey', '');
                        const { apiKey, model } = await inquirer.prompt([
                            {
                                type: 'password',
                                name: 'apiKey',
                                message: existingKey ? 'Kimi API key (Enter to keep):' : 'Enter Kimi API key:',
                                mask: '*',
                                default: existingKey,
                                validate: (input) => !input && existingKey ? true : input.length > 0 || 'API key required',
                            },
                            {
                                type: 'list',
                                name: 'model',
                                message: 'Which model?',
                                choices: [
                                    { name: 'Kimi k2.5', value: 'kimi-k2.5' },
                                    { name: 'Kimi v2', value: 'moonshot-v2' },
                                ],
                                default: getExistingLocal('ai.defaultModel', 'kimi-k2.5'),
                            },
                        ]);
                        config.ai.kimiKey = apiKey || existingKey;
                        config.ai.defaultModel = model;
                    }
                }

                if (sections.includes('platforms')) {
                    console.log(chalk.cyan('\n💬 Messaging Platforms\n'));
                    const { platforms } = await inquirer.prompt([
                        {
                            type: 'checkbox',
                            name: 'platforms',
                            message: 'Which platforms to enable?',
                            choices: [
                                { name: 'Discord', value: 'discord', checked: getExistingLocal('platforms.discord.enabled', false) },
                                { name: 'Telegram', value: 'telegram', checked: getExistingLocal('platforms.telegram.enabled', false) },
                            ],
                        },
                    ]);

                    if (platforms.includes('discord')) {
                        const existingToken = getExistingLocal('platforms.discord.token', '');
                        const discordConfig = await inquirer.prompt([
                            {
                                type: 'password',
                                name: 'token',
                                message: existingToken ? 'Discord token (Enter to keep):' : 'Enter Discord token:',
                                mask: '*',
                                default: existingToken,
                                validate: (input) => !input && existingToken ? true : input.length > 0 || 'Token required',
                            },
                            {
                                type: 'input',
                                name: 'allowedUsers',
                                message: 'Allowed user IDs (comma-separated):',
                                default: getExistingLocal('platforms.discord.allowedUsers', []).join(', '),
                            },
                            {
                                type: 'input',
                                name: 'adminUsers',
                                message: 'Admin user IDs (comma-separated):',
                                default: getExistingLocal('platforms.discord.adminUsers', []).join(', '),
                            },
                        ]);
                        config.platforms.discord = {
                            enabled: true,
                            token: discordConfig.token || existingToken,
                            allowedUsers: discordConfig.allowedUsers.split(',').map(s => s.trim()).filter(Boolean),
                            adminUsers: discordConfig.adminUsers.split(',').map(s => s.trim()).filter(Boolean),
                        };
                    } else {
                        config.platforms.discord = { enabled: false };
                    }

                    if (platforms.includes('telegram')) {
                        const existingToken = getExistingLocal('platforms.telegram.token', '');
                        const telegramConfig = await inquirer.prompt([
                            {
                                type: 'password',
                                name: 'token',
                                message: existingToken ? 'Telegram token (Enter to keep):' : 'Enter Telegram token:',
                                mask: '*',
                                default: existingToken,
                                validate: (input) => !input && existingToken ? true : input.length > 0 || 'Token required',
                            },
                            {
                                type: 'input',
                                name: 'allowedUsers',
                                message: 'Allowed user IDs (comma-separated):',
                                default: getExistingLocal('platforms.telegram.allowedUsers', []).join(', '),
                            },
                            {
                                type: 'input',
                                name: 'adminUsers',
                                message: 'Admin user IDs (comma-separated):',
                                default: getExistingLocal('platforms.telegram.adminUsers', []).join(', '),
                            },
                        ]);
                        config.platforms.telegram = {
                            enabled: true,
                            token: telegramConfig.token || existingToken,
                            allowedUsers: telegramConfig.allowedUsers.split(',').map(s => s.trim()).filter(Boolean),
                            adminUsers: telegramConfig.adminUsers.split(',').map(s => s.trim()).filter(Boolean),
                        };
                    } else {
                        config.platforms.telegram = { enabled: false };
                    }
                }

                if (sections.includes('pluginSettings')) {
                    console.log(chalk.cyan('\n🔌 Plugin Settings\n'));
                    const { hotReload } = await inquirer.prompt([
                        {
                            type: 'confirm',
                            name: 'hotReload',
                            message: 'Enable hot reload?',
                            default: getExistingLocal('plugins.hotReload', true),
                        },
                    ]);
                    config.plugins.hotReload = hotReload;
                }

                if (sections.includes('plugins')) {
                    console.log(chalk.cyan('\n🔌 Optional Plugins\n'));
                    console.log(chalk.gray('Note: Edit config.json manually for plugin API keys.\n'));
                }

                // Save and exit
                fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
                console.log(chalk.green('\n✅ Configuration updated!\n'));
                return;
            }
        } catch (e) {
            console.log(chalk.yellow('⚠ Could not read existing config, starting fresh.\n'));
        }
    }

    // Helper to get existing value
    const getExisting = (path, defaultVal) => {
        if (!existingConfig) return defaultVal;
        const parts = path.split('.');
        let val = existingConfig;
        for (const part of parts) {
            val = val?.[part];
        }
        return val !== undefined ? val : defaultVal;
    };


    const config = {
        bot: existingConfig?.bot || {},
        ai: existingConfig?.ai || {},
        platforms: existingConfig?.platforms || {},
        plugins: existingConfig?.plugins || {},
        security: existingConfig?.security || {},
    };

    // ─────────────────────────────────────────────────────────────
    // BOT SETTINGS
    // ─────────────────────────────────────────────────────────────
    console.log(chalk.cyan('\n📋 Bot Settings\n'));

    const botSettings = await inquirer.prompt([
        {
            type: 'input',
            name: 'name',
            message: 'What should your bot be called?',
            default: getExisting('bot.name', 'FreppeBot'),
        },
        {
            type: 'input',
            name: 'prefix',
            message: 'Command prefix (e.g., ! or /)',
            default: getExisting('bot.commandPrefix', '!'),
        },
        {
            type: 'list',
            name: 'logLevel',
            message: 'Log level:',
            choices: ['error', 'warn', 'info', 'debug'],
            default: getExisting('bot.logLevel', 'info'),
        },
    ]);

    config.bot = {
        ...config.bot,
        name: botSettings.name,
        commandPrefix: botSettings.prefix,
        logLevel: botSettings.logLevel,
    };

    // ─────────────────────────────────────────────────────────────
    // BOT PERSONALITY
    // ─────────────────────────────────────────────────────────────
    console.log(chalk.cyan('\n🎭 Bot Personality\n'));
    console.log(chalk.gray('Tell me how your bot should behave and respond!\n'));

    const personality = await inquirer.prompt([
        {
            type: 'list',
            name: 'style',
            message: 'Response style:',
            choices: [
                { name: 'Short & concise (quick, to-the-point responses)', value: 'concise' },
                { name: 'Balanced (mix of detail and brevity)', value: 'balanced' },
                { name: 'Detailed & thorough (comprehensive explanations)', value: 'detailed' },
            ],
            default: 1,
        },
        {
            type: 'list',
            name: 'tone',
            message: 'Personality tone:',
            choices: [
                { name: 'Professional (formal, business-like)', value: 'professional' },
                { name: 'Friendly (warm, casual, approachable)', value: 'friendly' },
                { name: 'Witty (humorous, playful, fun)', value: 'witty' },
                { name: 'Chill (relaxed, laid-back, uses slang)', value: 'chill' },
                { name: 'Sarcastic (dry humor, sassy)', value: 'sarcastic' },
            ],
            default: 1,
        },
        {
            type: 'confirm',
            name: 'useEmojis',
            message: 'Should the bot use emojis in responses?',
            default: true,
        },
        {
            type: 'input',
            name: 'identity',
            message: 'Who is the bot? (e.g., "a helpful AI assistant", "your sarcastic friend")',
            default: `a helpful AI assistant named ${botSettings.name}`,
        },
        {
            type: 'input',
            name: 'customInstructions',
            message: 'Any custom instructions? (optional, press Enter to skip)',
            default: '',
        },
    ]);

    // Store personality settings
    config.bot.personality = {
        style: personality.style,
        tone: personality.tone,
        useEmojis: personality.useEmojis,
        identity: personality.identity,
        customInstructions: personality.customInstructions,
    };

    // ─────────────────────────────────────────────────────────────
    // AI PROVIDER
    // ─────────────────────────────────────────────────────────────
    console.log(chalk.cyan('\n🧠 AI Provider Settings\n'));

    const aiProvider = await inquirer.prompt([
        {
            type: 'list',
            name: 'provider',
            message: 'Which AI provider do you want to use?',
            choices: [
                { name: 'OpenRouter (Recommended - access to 100+ models)', value: 'openrouter' },
                { name: 'OpenAI (Direct GPT-4 access)', value: 'openai' },
                { name: 'Anthropic (Direct Claude access)', value: 'anthropic' },
                { name: 'Kimi / Moonshot AI', value: 'kimi' },
            ],
            default: getExisting('ai.defaultProvider', 'openrouter'),
        },
    ]);

    config.ai.defaultProvider = aiProvider.provider;

    // Get API key based on provider
    if (aiProvider.provider === 'openrouter') {
        const existingKey = getExisting('ai.openrouterKey', '');
        
        // First get API key (needed to fetch models)
        const { apiKey } = await inquirer.prompt([
            {
                type: 'password',
                name: 'apiKey',
                message: existingKey ? 'OpenRouter API key (press Enter to keep existing):' : 'Enter your OpenRouter API key:',
                mask: '*',
                default: existingKey,
                validate: (input) => {
                    if (!input && existingKey) return true; // Allow empty if existing
                    return input.length > 0 || 'API key is required';
                },
            },
        ]);
        
        const keyToUse = apiKey || existingKey;
        config.ai.openrouterKey = keyToUse;

        // Fetch models from OpenRouter API
        console.log(chalk.gray('\n  Fetching available models from OpenRouter...'));
        let modelChoices = null;
        
        modelChoices = await fetchOpenRouterModels();

        // If fetch failed, use default list
        if (!modelChoices || modelChoices.length === 0) {
            modelChoices = [
                { name: 'Claude Sonnet 4.5 (Recommended)', value: 'anthropic/claude-sonnet-4.5' },
                { name: 'Claude Opus 4.5', value: 'anthropic/claude-opus-4.5' },
                { name: 'GPT-5.2', value: 'openai/gpt-5.2' },
                { name: 'GPT-5.2 Pro', value: 'openai/gpt-5.2-pro' },
                { name: 'GPT-4o', value: 'openai/gpt-4o' },
                { name: 'Claude 3.5 Sonnet', value: 'anthropic/claude-3.5-sonnet' },
                { name: 'Llama 3.1 70B', value: 'meta-llama/llama-3.1-70b-instruct' },
            ];
        }

        const { model } = await inquirer.prompt([
            {
                type: 'list',
                name: 'model',
                message: 'Which model do you want to use?',
                choices: modelChoices,
                default: getExisting('ai.defaultModel', modelChoices[0]?.value || 'anthropic/claude-sonnet-4.5'),
                pageSize: 15,
            },
        ]);
        config.ai.defaultModel = model;
    } else if (aiProvider.provider === 'openai') {
        const existingKey = getExisting('ai.openaiKey', '');
        const { apiKey, model } = await inquirer.prompt([
            {
                type: 'password',
                name: 'apiKey',
                message: existingKey ? 'OpenAI API key (press Enter to keep existing):' : 'Enter your OpenAI API key:',
                mask: '*',
                default: existingKey,
                validate: (input) => {
                    if (!input && existingKey) return true;
                    return input.length > 0 || 'API key is required';
                },
            },
            {
                type: 'list',
                name: 'model',
                message: 'Which model do you want to use?',
                choices: [
                    { name: 'GPT-5.2 Pro (Recommended)', value: 'gpt-5.2-pro' },
                    { name: 'GPT-5.2', value: 'gpt-5.2' },
                    { name: 'GPT-4o', value: 'gpt-4o' },
                    { name: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
                ],
                default: getExisting('ai.defaultModel', 'gpt-5.2-pro'),
            },
        ]);
        config.ai.openaiKey = apiKey;
        config.ai.defaultModel = model;
    } else if (aiProvider.provider === 'anthropic') {
        const existingKey = getExisting('ai.anthropicKey', '');
        const { apiKey, model } = await inquirer.prompt([
            {
                type: 'password',
                name: 'apiKey',
                message: existingKey ? 'Anthropic API key (press Enter to keep existing):' : 'Enter your Anthropic API key:',
                mask: '*',
                default: existingKey,
                validate: (input) => {
                    if (!input && existingKey) return true;
                    return input.length > 0 || 'API key is required';
                },
            },
            {
                type: 'list',
                name: 'model',
                message: 'Which model do you want to use?',
                choices: [
                    { name: 'Claude Sonnet 4.5 (Recommended)', value: 'claude-sonnet-4.5' },
                    { name: 'Claude Opus 4.5', value: 'claude-opus-4.5' },
                    { name: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20241022' },
                    { name: 'Claude 3 Opus', value: 'claude-3-opus-20240229' },
                ],
                default: getExisting('ai.defaultModel', 'claude-sonnet-4.5'),
            },
        ]);
        config.ai.anthropicKey = apiKey;
        config.ai.defaultModel = model;
    } else if (aiProvider.provider === 'kimi') {
        const existingKey = getExisting('ai.kimiKey', '');
        console.log(chalk.gray('\n  Kimi/Moonshot Setup:'));
        console.log(chalk.gray('  Get your API key from https://platform.moonshot.cn/\n'));

        const { apiKey, model } = await inquirer.prompt([
            {
                type: 'password',
                name: 'apiKey',
                message: existingKey ? 'Kimi API key (press Enter to keep existing):' : 'Enter your Kimi/Moonshot API key:',
                mask: '*',
                default: existingKey,
                validate: (input) => {
                    if (!input && existingKey) return true;
                    return input.length > 0 || 'API key is required';
                },
            },
            {
                type: 'list',
                name: 'model',
                message: 'Which Kimi model do you want to use?',
                choices: [
                    { name: 'Kimi k2.5 (Latest, most capable)', value: 'kimi-k2.5' },
                    { name: 'Kimi v2', value: 'moonshot-v2' },
                    { name: 'Kimi v1 32K', value: 'moonshot-v1-32k' },
                    { name: 'Kimi v1 128K (Long context)', value: 'moonshot-v1-128k' },
                    { name: 'Kimi v1 8K (Faster)', value: 'moonshot-v1-8k' },
                ],
                default: getExisting('ai.defaultModel', 'kimi-k2.5'),
            },
        ]);
        config.ai.kimiKey = apiKey;
        config.ai.defaultModel = model;
    }

    // ─────────────────────────────────────────────────────────────
    // MESSAGING PLATFORMS
    // ─────────────────────────────────────────────────────────────
    console.log(chalk.cyan('\n💬 Messaging Platforms\n'));

    const { platforms } = await inquirer.prompt([
        {
            type: 'checkbox',
            name: 'platforms',
            message: 'Which platforms do you want to enable?',
            choices: [
                { name: 'Discord', value: 'discord' },
                { name: 'Telegram', value: 'telegram' },
            ],
            validate: (input) => input.length > 0 || 'Select at least one platform',
        },
    ]);

    // Discord setup
    if (platforms.includes('discord')) {
        console.log(chalk.gray('\n  Discord Setup:'));
        console.log(chalk.gray('  1. Go to https://discord.com/developers/applications'));
        console.log(chalk.gray('  2. Create a new application'));
        console.log(chalk.gray('  3. Go to Bot > Add Bot > Copy Token\n'));

        const existingDiscordToken = getExisting('platforms.discord.token', '');
        const discordConfig = await inquirer.prompt([
            {
                type: 'password',
                name: 'token',
                message: existingDiscordToken ? 'Discord bot token (press Enter to keep existing):' : 'Enter your Discord bot token:',
                mask: '*',
                default: existingDiscordToken,
                validate: (input) => {
                    if (!input && existingDiscordToken) return true;
                    return input.length > 0 || 'Token is required';
                },
            },
            {
                type: 'input',
                name: 'allowedUsers',
                message: 'Allowed user IDs (comma-separated, leave empty for everyone):',
                default: getExisting('platforms.discord.allowedUsers', []).join(', '),
            },
            {
                type: 'input',
                name: 'adminUsers',
                message: 'Admin user IDs (comma-separated, can use dangerous plugins):',
                default: getExisting('platforms.discord.adminUsers', []).join(', '),
            },
        ]);

        config.platforms.discord = {
            enabled: true,
            token: discordConfig.token || existingDiscordToken,
            allowedUsers: discordConfig.allowedUsers.split(',').map(s => s.trim()).filter(Boolean),
            adminUsers: discordConfig.adminUsers.split(',').map(s => s.trim()).filter(Boolean),
        };
    }

    // Telegram setup
    if (platforms.includes('telegram')) {
        console.log(chalk.gray('\n  Telegram Setup:'));
        console.log(chalk.gray('  1. Message @BotFather on Telegram'));
        console.log(chalk.gray('  2. Send /newbot and follow the prompts'));
        console.log(chalk.gray('  3. Copy the bot token\n'));

        const telegramConfig = await inquirer.prompt([
            {
                type: 'password',
                name: 'token',
                message: 'Enter your Telegram bot token:',
                mask: '*',
                validate: (input) => input.length > 0 || 'Token is required',
            },
            {
                type: 'input',
                name: 'allowedUsers',
                message: 'Allowed user IDs (comma-separated, leave empty for everyone):',
                default: '',
            },
            {
                type: 'input',
                name: 'adminUsers',
                message: 'Admin user IDs (comma-separated):',
                default: '',
            },
        ]);

        config.platforms.telegram = {
            enabled: true,
            token: telegramConfig.token || existingTelegramToken,
            allowedUsers: telegramConfig.allowedUsers.split(',').map(s => s.trim()).filter(Boolean),
            adminUsers: telegramConfig.adminUsers.split(',').map(s => s.trim()).filter(Boolean),
        };
    }

    // ─────────────────────────────────────────────────────────────
    // OPTIONAL: TWITTER
    // ─────────────────────────────────────────────────────────────
    console.log(chalk.cyan('\n🐦 Optional: Twitter/X Integration\n'));

    const { setupTwitter } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'setupTwitter',
            message: 'Do you want to set up Twitter/X integration?',
            default: false,
        },
    ]);

    if (setupTwitter) {
        console.log(chalk.gray('\n  Twitter Setup:'));
        console.log(chalk.gray('  1. Go to https://developer.twitter.com'));
        console.log(chalk.gray('  2. Create a project and app'));
        console.log(chalk.gray('  3. Get your API keys\n'));

        const twitterConfig = await inquirer.prompt([
            {
                type: 'password',
                name: 'apiKey',
                message: 'Twitter API Key:',
                mask: '*',
            },
            {
                type: 'password',
                name: 'apiSecret',
                message: 'Twitter API Secret:',
                mask: '*',
            },
            {
                type: 'password',
                name: 'accessToken',
                message: 'Twitter Access Token:',
                mask: '*',
            },
            {
                type: 'password',
                name: 'accessSecret',
                message: 'Twitter Access Secret:',
                mask: '*',
            },
        ]);

        config.plugins.twitter = {
            apiKey: twitterConfig.apiKey,
            apiSecret: twitterConfig.apiSecret,
            accessToken: twitterConfig.accessToken,
            accessSecret: twitterConfig.accessSecret,
        };
    }

    // ─────────────────────────────────────────────────────────────
    // OPTIONAL: BRAVE SEARCH
    // ─────────────────────────────────────────────────────────────
    console.log(chalk.cyan('\n🔍 Optional: Brave Search (Web Search)\n'));

    const { setupBrave } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'setupBrave',
            message: 'Set up Brave Search? (allows bot to search the web)',
            default: false,
        },
    ]);

    if (setupBrave) {
        console.log(chalk.gray('\n  Brave Search Setup:'));
        console.log(chalk.gray('  1. Go to https://brave.com/search/api/'));
        console.log(chalk.gray('  2. Sign up (free tier: 2000 queries/month)'));
        console.log(chalk.gray('  3. Get your API key\n'));

        const braveConfig = await inquirer.prompt([
            {
                type: 'password',
                name: 'apiKey',
                message: 'Brave Search API Key:',
                mask: '*',
            },
        ]);

        config.plugins.brave = {
            apiKey: braveConfig.apiKey,
        };
    }

    // ─────────────────────────────────────────────────────────────
    // OPTIONAL: SPOTIFY
    // ─────────────────────────────────────────────────────────────
    console.log(chalk.cyan('\n🎵 Optional: Spotify Integration\n'));

    const { setupSpotify } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'setupSpotify',
            message: 'Do you want to set up Spotify? (search songs, get recommendations)',
            default: false,
        },
    ]);

    if (setupSpotify) {
        console.log(chalk.gray('\n  Spotify Setup:'));
        console.log(chalk.gray('  1. Go to https://developer.spotify.com/dashboard'));
        console.log(chalk.gray('  2. Create an app'));
        console.log(chalk.gray('  3. Get Client ID and Client Secret\n'));

        const spotifyConfig = await inquirer.prompt([
            {
                type: 'password',
                name: 'clientId',
                message: 'Spotify Client ID:',
                mask: '*',
            },
            {
                type: 'password',
                name: 'clientSecret',
                message: 'Spotify Client Secret:',
                mask: '*',
            },
        ]);

        config.plugins.spotify = {
            clientId: spotifyConfig.clientId,
            clientSecret: spotifyConfig.clientSecret,
        };
    }

    // ─────────────────────────────────────────────────────────────
    // OPTIONAL: EMAIL
    // ─────────────────────────────────────────────────────────────
    console.log(chalk.cyan('\n📧 Optional: Email Sending\n'));

    const { setupEmail } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'setupEmail',
            message: 'Do you want to set up email sending?',
            default: false,
        },
    ]);

    if (setupEmail) {
        console.log(chalk.gray('\n  Email Setup (SMTP):'));
        console.log(chalk.gray('  For Gmail: Use an App Password from https://myaccount.google.com/apppasswords\n'));

        const emailConfig = await inquirer.prompt([
            {
                type: 'list',
                name: 'provider',
                message: 'Email provider:',
                choices: [
                    { name: 'Gmail', value: 'gmail' },
                    { name: 'Outlook/Hotmail', value: 'outlook' },
                    { name: 'Custom SMTP', value: 'custom' },
                ],
            },
            {
                type: 'input',
                name: 'user',
                message: 'Your email address:',
            },
            {
                type: 'password',
                name: 'password',
                message: 'Email password (or App Password for Gmail):',
                mask: '*',
            },
        ]);

        const smtpHosts = {
            gmail: { host: 'smtp.gmail.com', port: 587 },
            outlook: { host: 'smtp.office365.com', port: 587 },
            custom: { host: '', port: 587 },
        };

        if (emailConfig.provider === 'custom') {
            const customSmtp = await inquirer.prompt([
                { type: 'input', name: 'host', message: 'SMTP host:' },
                { type: 'input', name: 'port', message: 'SMTP port:', default: '587' },
            ]);
            smtpHosts.custom = { host: customSmtp.host, port: parseInt(customSmtp.port) };
        }

        config.plugins.email = {
            smtp: {
                host: smtpHosts[emailConfig.provider].host,
                port: smtpHosts[emailConfig.provider].port,
                user: emailConfig.user,
                password: emailConfig.password,
            },
            fromName: config.bot.name,
        };
    }

    // ─────────────────────────────────────────────────────────────
    // PLUGIN SETTINGS
    // ─────────────────────────────────────────────────────────────
    console.log(chalk.cyan('\n🔌 Plugin Settings\n'));

    const pluginSettings = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'hotReload',
            message: 'Enable hot reload? (plugins auto-load when changed)',
            default: true,
        },
    ]);

    config.plugins.hotReload = pluginSettings.hotReload;

    // ─────────────────────────────────────────────────────────────
    // SAVE CONFIG
    // ─────────────────────────────────────────────────────────────

    // Save config
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

    console.log(chalk.green('\n✅ Configuration saved to config.json!\n'));
    console.log(chalk.cyan('Next steps:'));
    console.log(chalk.white('  1. Run `npm start` to start the bot'));
    console.log(chalk.white('  2. Add plugins to the plugins/community/ folder'));
    console.log(chalk.white('  3. Message your bot on Discord or Telegram!\n'));

    // Show Discord invite URL hint
    if (platforms.includes('discord')) {
        console.log(chalk.gray('💡 After starting, you\'ll see a Discord invite URL in the logs.\n'));
    }
}

function printBanner() {
    const banner = `
${chalk.cyan('╔═══════════════════════════════════════════════════════════════╗')}
${chalk.cyan('║')}                                                               ${chalk.cyan('║')}
${chalk.cyan('║')}   ${chalk.white('███████╗██████╗ ███████╗██████╗ ██████╗ ███████╗')}            ${chalk.cyan('║')}
${chalk.cyan('║')}   ${chalk.white('██╔════╝██╔══██╗██╔════╝██╔══██╗██╔══██╗██╔════╝')}            ${chalk.cyan('║')}
${chalk.cyan('║')}   ${chalk.white('█████╗  ██████╔╝█████╗  ██████╔╝██████╔╝█████╗')}              ${chalk.cyan('║')}
${chalk.cyan('║')}   ${chalk.white('██╔══╝  ██╔══██╗██╔══╝  ██╔═══╝ ██╔═══╝ ██╔══╝')}              ${chalk.cyan('║')}
${chalk.cyan('║')}   ${chalk.white('██║     ██║  ██║███████╗██║     ██║     ███████╗')}            ${chalk.cyan('║')}
${chalk.cyan('║')}   ${chalk.white('╚═╝     ╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝     ╚══════╝')}            ${chalk.cyan('║')}
${chalk.cyan('║')}                                                               ${chalk.cyan('║')}
${chalk.cyan('║')}                    ${chalk.yellow('SETUP WIZARD')}                              ${chalk.cyan('║')}
${chalk.cyan('║')}                                                               ${chalk.cyan('║')}
${chalk.cyan('╚═══════════════════════════════════════════════════════════════╝')}
`;
    console.log(banner);
}

main().catch(console.error);
