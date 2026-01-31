/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     CONFIG LOADER                              ║
 * ║                                                                 ║
 * ║   Loads configuration from config.json                        ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(process.cwd(), 'config.json');

/**
 * Load configuration from config.json
 */
function loadConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
        console.error('\n❌ config.json not found!');
        console.error('   Run `npm run setup` to configure your bot.\n');
        process.exit(1);
    }

    try {
        const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
        const config = JSON.parse(raw);
        return validateConfig(config);
    } catch (error) {
        console.error('\n❌ Failed to load config.json:', error.message);
        console.error('   Run `npm run setup` to reconfigure.\n');
        process.exit(1);
    }
}

/**
 * Validate and transform config
 */
function validateConfig(config) {
    // Ensure required sections exist
    if (!config.bot) config.bot = {};
    if (!config.ai) config.ai = {};
    if (!config.platforms) config.platforms = {};
    if (!config.plugins) config.plugins = {};
    if (!config.security) config.security = {};

    // Set defaults
    config.bot.name = config.bot.name || 'FreppeBot';
    config.bot.commandPrefix = config.bot.commandPrefix || '!';
    config.bot.logLevel = config.bot.logLevel || 'info';

    // Validate log level
    const validLogLevels = ['error', 'warn', 'info', 'debug'];
    if (!validLogLevels.includes(config.bot.logLevel)) {
        console.warn(`⚠️  Invalid log level "${config.bot.logLevel}", using "info"`);
        config.bot.logLevel = 'info';
    }

    // Validate command prefix
    if (typeof config.bot.commandPrefix !== 'string' || config.bot.commandPrefix.length === 0) {
        console.warn('⚠️  Invalid command prefix, using "!"');
        config.bot.commandPrefix = '!';
    }

    // Validate AI provider
    if (!config.ai.defaultProvider) {
        console.error('\n❌ No AI provider configured!');
        console.error('   Run `npm run setup` to configure.\n');
        process.exit(1);
    }

    // Check for at least one API key
    const hasOpenRouter = config.ai.openrouterKey && config.ai.openrouterKey.length > 0;
    const hasOpenAI = config.ai.openaiKey && config.ai.openaiKey.length > 0;
    const hasAnthropic = config.ai.anthropicKey && config.ai.anthropicKey.length > 0;
    const hasKimi = config.ai.kimiKey && config.ai.kimiKey.length > 0;

    if (!hasOpenRouter && !hasOpenAI && !hasAnthropic && !hasKimi) {
        console.error('\n❌ No AI API keys configured!');
        console.error('   Run `npm run setup` to configure.\n');
        process.exit(1);
    }

    // Check for at least one platform
    const hasDiscord = config.platforms.discord?.enabled && config.platforms.discord?.token;
    const hasTelegram = config.platforms.telegram?.enabled && config.platforms.telegram?.token;

    if (!hasDiscord && !hasTelegram) {
        console.error('\n❌ No messaging platforms configured!');
        console.error('   Run `npm run setup` to configure Discord or Telegram.\n');
        process.exit(1);
    }

    // Validate platform tokens
    if (config.platforms.discord?.enabled && (!config.platforms.discord.token || config.platforms.discord.token.length < 10)) {
        console.warn('⚠️  Discord token appears invalid');
    }

    if (config.platforms.telegram?.enabled && (!config.platforms.telegram.token || config.platforms.telegram.token.length < 10)) {
        console.warn('⚠️  Telegram token appears invalid');
    }

    return config;
}

/**
 * Save config back to file
 */
function saveConfig(config) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

/**
 * Get a nested config value
 */
function getConfigValue(config, path, defaultValue = null) {
    const parts = path.split('.');
    let current = config;

    for (const part of parts) {
        if (current === null || current === undefined) {
            return defaultValue;
        }
        current = current[part];
    }

    return current !== undefined ? current : defaultValue;
}

module.exports = {
    loadConfig,
    saveConfig,
    getConfigValue,
    CONFIG_PATH,
};
