/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     DISCORD ADAPTER                            ║
 * ║                                                                 ║
 * ║   Connects FreppeBot to Discord                                ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const { Client, GatewayIntentBits, Partials } = require('discord.js');
const BaseAdapter = require('./base');
const logger = require('../utils/logger');

class DiscordAdapter extends BaseAdapter {
    constructor(config, router) {
        super(config, router);
        this.name = 'Discord';
        this.platform = 'discord';

        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages,
            ],
            partials: [
                Partials.Channel, // Required for DMs
                Partials.Message,
            ],
        });

        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.client.on('ready', () => {
            logger.info(`Discord: Logged in as ${this.client.user.tag}`);
            logger.info(`Discord: Invite URL: https://discord.com/oauth2/authorize?client_id=${this.client.user.id}&permissions=274877975552&scope=bot`);
        });

        this.client.on('messageCreate', async (message) => {
            await this.handleMessage(message);
        });

        this.client.on('error', (error) => {
            logger.error('Discord error:', error);
        });
    }

    async handleMessage(message) {
        // Ignore bot messages
        if (message.author.bot) return;

        // Check if bot is mentioned or it's a DM
        const isDM = !message.guild;
        const isMentioned = message.mentions.has(this.client.user);
        const hasPrefix = message.content.startsWith(process.env.COMMAND_PREFIX || '!');

        // Only respond to DMs, mentions, or prefix commands
        if (!isDM && !isMentioned && !hasPrefix) return;

        const userId = message.author.id;

        // Check if user is allowed
        if (!this.isAllowed(userId)) {
            logger.warn(`Discord: Unauthorized user ${userId} (${message.author.tag})`);
            return;
        }

        // Clean content (remove mention)
        let content = message.content;
        if (isMentioned) {
            content = content.replace(/<@!?\d+>/g, '').trim();
        }

        if (!content) return;

        // Create message object for router
        const msg = this.createMessage({
            content,
            userId,
            channelId: message.channel.id,
            rawMessage: message,
            reply: async (text) => {
                await this.sendReply(message, text);
            },
            sendTyping: async () => {
                await message.channel.sendTyping();
            },
        });

        // Route message
        await this.router.handleMessage(msg);
    }

    async sendReply(message, text) {
        // Discord has a 2000 character limit
        const chunks = this.splitMessage(text, 1900);

        for (let i = 0; i < chunks.length; i++) {
            if (i === 0) {
                await message.reply(chunks[i]);
            } else {
                await message.channel.send(chunks[i]);
            }
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
        await this.client.login(this.config.token);
    }

    async stop() {
        await this.client.destroy();
    }
}

module.exports = DiscordAdapter;
