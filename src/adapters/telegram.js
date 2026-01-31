/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     TELEGRAM ADAPTER                           ║
 * ║                                                                 ║
 * ║   Connects FreppeBot to Telegram                               ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const { Telegraf } = require('telegraf');
const BaseAdapter = require('./base');
const logger = require('../utils/logger');

class TelegramAdapter extends BaseAdapter {
    constructor(config, router) {
        super(config, router);
        this.name = 'Telegram';
        this.platform = 'telegram';

        this.bot = new Telegraf(config.token);
        this.setupHandlers();
    }

    setupHandlers() {
        // Handle text messages
        this.bot.on('text', async (ctx) => {
            await this.handleMessage(ctx);
        });

        // Handle /start command
        this.bot.command('start', async (ctx) => {
            const botName = process.env.BOT_NAME || 'FreppeBot';
            await ctx.reply(
                `👋 Hello! I'm ${botName}, your AI assistant.\n\n` +
                `Just send me a message and I'll help you out!\n\n` +
                `Commands:\n` +
                `• /help - Show available commands\n` +
                `• /plugins - List loaded plugins`
            );
        });

        // Error handling
        this.bot.catch((err) => {
            logger.error('Telegram error:', err);
        });
    }

    async handleMessage(ctx) {
        const message = ctx.message;
        const userId = message.from.id.toString();
        const content = message.text;

        // Check if user is allowed
        if (!this.isAllowed(userId)) {
            logger.warn(`Telegram: Unauthorized user ${userId} (@${message.from.username})`);
            return;
        }

        if (!content) return;

        // Create message object for router
        const msg = this.createMessage({
            content,
            userId,
            channelId: message.chat.id.toString(),
            rawMessage: ctx,
            reply: async (text) => {
                await this.sendReply(ctx, text);
            },
            sendTyping: async () => {
                await ctx.sendChatAction('typing');
            },
        });

        // Route message
        await this.router.handleMessage(msg);
    }

    async sendReply(ctx, text) {
        // Telegram has a 4096 character limit
        const chunks = this.splitMessage(text, 4000);

        for (const chunk of chunks) {
            await ctx.reply(chunk, { parse_mode: 'Markdown' }).catch(async () => {
                // If markdown fails, send as plain text
                await ctx.reply(chunk);
            });
        }
    }

    splitMessage(text, maxLength) {
        if (text.length <= maxLength) return [text];

        const chunks = [];
        let current = '';

        const lines = text.split('\n');
        for (const line of lines) {
            if (current.length + line.length + 1 > maxLength) {
                if (current) chunks.push(current);
                current = line;
            } else {
                current = current ? current + '\n' + line : line;
            }
        }

        if (current) chunks.push(current);
        return chunks;
    }

    async start() {
        // Use polling for simplicity (works on any server)
        await this.bot.launch();

        const botInfo = await this.bot.telegram.getMe();
        logger.info(`Telegram: Logged in as @${botInfo.username}`);
    }

    async stop() {
        this.bot.stop('SIGTERM');
    }
}

module.exports = TelegramAdapter;
