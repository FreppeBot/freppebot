/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     MESSAGE ROUTER                             ║
 * ║      Routes messages to AI and plugins, handles responses      ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const logger = require('../utils/logger');
const Context = require('./context');
const RateLimiter = require('../utils/ratelimit');
const CooldownManager = require('../utils/cooldown');
const { generateRequestId } = require('../utils/request-id');
const { withTimeout } = require('../utils/timeout');

class MessageRouter {
    constructor({ bot, pluginRegistry, aiManager, memory, config, healthMonitor }) {
        this.bot = bot;
        this.pluginRegistry = pluginRegistry;
        this.aiManager = aiManager;
        this.memory = memory;
        this.config = config;
        this.healthMonitor = healthMonitor;

        // Initialize rate limiter (10 requests per minute per user)
        this.rateLimiter = new RateLimiter({
            windowMs: 60000, // 1 minute
            maxRequests: 10,
        });

        // Initialize cooldown manager
        this.cooldownManager = new CooldownManager();
        this.cooldownManager.setCommandCooldown('shell', 5000); // 5s cooldown for shell
        this.cooldownManager.setCommandCooldown('remind', 3000); // 3s cooldown for reminders

        // Cleanup cooldowns every 5 minutes
        setInterval(() => this.cooldownManager.cleanup(), 5 * 60 * 1000);
    }

    /**
     * Validate and sanitize input
     */
    validateInput(content) {
        if (!content || typeof content !== 'string') {
            return { valid: false, error: 'Invalid message content' };
        }

        // Check length (prevent extremely long messages)
        if (content.length > 10000) {
            return { valid: false, error: 'Message too long (max 10000 characters)' };
        }

        // Basic sanitization (remove null bytes, etc.)
        const sanitized = content.replace(/\0/g, '').trim();

        if (!sanitized) {
            return { valid: false, error: 'Empty message' };
        }

        return { valid: true, content: sanitized };
    }

    /**
     * Handle incoming message from any adapter
     */
    async handleMessage(message) {
        const { content: rawContent, userId, platform, isAdmin, reply, sendTyping } = message;

        // Generate request ID for tracking
        const requestId = generateRequestId();
        logger.debug(`[${requestId}] [${platform}] Message from ${userId}`);

        // Validate input
        const validation = this.validateInput(rawContent);
        if (!validation.valid) {
            logger.warn(`[${requestId}] Invalid input from ${userId}: ${validation.error}`);
            return; // Silently ignore invalid input
        }

        const content = validation.content;

        logger.debug(`[${requestId}] [${platform}] Message from ${userId}: ${content.substring(0, 50)}...`);

        // Check rate limit (skip for admins)
        if (!isAdmin) {
            const rateLimit = this.rateLimiter.check(userId);
            if (!rateLimit.allowed) {
                logger.warn(`[${platform}] Rate limit exceeded for ${userId}`);
                await reply(`⏱️ Rate limit exceeded. Please wait ${Math.ceil((rateLimit.resetAt - Date.now()) / 1000)}s before trying again.`);
                return;
            }
        }

        // Create execution context with request ID
        const ctx = new Context({
            message: { ...message, content },
            bot: this.bot,
            memory: this.memory,
            pluginRegistry: this.pluginRegistry,
            isAdmin,
            requestId,
        });

        try {
            // Check if it's a direct command (starts with prefix)
            if (content.startsWith(this.config.commandPrefix)) {
                const handled = await this.handleCommand(ctx);
                if (handled) return;
            }

            // Record message
            if (this.healthMonitor) {
                this.healthMonitor.recordMessage();
            }

            // Otherwise, route to AI with plugin tools available
            await this.handleAIConversation(ctx);

        } catch (error) {
            logger.error(`[${requestId}] Error handling message:`, error);
            
            // Record error in health monitor
            if (this.healthMonitor) {
                this.healthMonitor.recordError(error);
            }
            
            // Provide more helpful error messages
            let errorMessage = '❌ Sorry, something went wrong.';
            if (error.message && !error.message.includes('timed out')) {
                // Don't expose timeout details to users
                errorMessage += ` ${error.message}`;
            }
            
            // Don't expose internal errors to users, but log them
            if (error.stack) {
                logger.debug(`[${requestId}] Error stack:`, error.stack);
            }

            try {
                await reply(errorMessage);
            } catch (replyError) {
                logger.error(`[${requestId}] Failed to send error message:`, replyError);
            }
        }
    }

    /**
     * Handle direct command (e.g., !help, !plugins)
     */
    async handleCommand(ctx) {
        const { content } = ctx.message;
        const parts = content.slice(this.config.commandPrefix.length).trim().split(/\s+/);
        const commandName = parts[0].toLowerCase();
        const args = parts.slice(1);

        // Check cooldown (skip for admins)
        if (!ctx.isAdmin) {
            const cooldown = this.cooldownManager.check(ctx.message.userId, commandName);
            if (!cooldown.allowed) {
                await ctx.message.reply(`⏱️ Command on cooldown. Please wait ${cooldown.remaining}s.`);
                return true;
            }
        }

        // Built-in commands
        if (commandName === 'help') {
            return this.showHelp(ctx);
        }

        if (commandName === 'plugins') {
            return this.listPlugins(ctx);
        }

        if (commandName === 'health' || commandName === 'status') {
            return this.showHealth(ctx);
        }

        if (commandName === 'backup') {
            return this.handleBackup(ctx, args);
        }

        // Find plugin command
        const command = this.pluginRegistry.getCommand(commandName);
        if (command) {
            try {
                await ctx.message.sendTyping();
                
                // Record command execution
                if (this.healthMonitor) {
                    this.healthMonitor.recordCommand();
                }
                
                const result = await command.handler(ctx, args);
                if (result) {
                    await ctx.message.reply(result);
                }
                return true;
            } catch (error) {
                logger.error(`Command ${commandName} failed:`, error);
                
                // Record error
                if (this.healthMonitor) {
                    this.healthMonitor.recordError(error);
                }
                
                await ctx.message.reply(`❌ Command failed: ${error.message || 'Unknown error'}`);
                return true;
            }
        }

        return false; // Not handled, pass to AI
    }

    /**
     * Show help information
     */
    async showHelp(ctx) {
        const commands = this.pluginRegistry.getAllCommands();

        let help = `🤖 **${this.config.botName} Help**\n\n`;
        help += `**Built-in Commands:**\n`;
        help += `• \`${this.config.commandPrefix}help\` - Show this help\n`;
        help += `• \`${this.config.commandPrefix}plugins\` - List loaded plugins\n`;
        help += `• \`${this.config.commandPrefix}health\` - Show bot health status\n`;
        help += `• \`${this.config.commandPrefix}backup\` - Manage database backups (admin)\n\n`;

        if (commands.length > 0) {
            help += `**Plugin Commands:**\n`;
            for (const cmd of commands) {
                help += `• \`${this.config.commandPrefix}${cmd.name}\` - ${cmd.description}\n`;
            }
            help += '\n';
        }

        help += `**AI Conversation:**\n`;
        help += `Just send me a message without the prefix and I'll use AI to help you!\n`;
        help += `I can also use tools from plugins to take actions for you.`;

        await ctx.message.reply(help);
        return true;
    }

    /**
     * List loaded plugins
     */
    async listPlugins(ctx) {
        const plugins = this.pluginRegistry.getAllPlugins();

        let msg = `📦 **Loaded Plugins (${plugins.length})**\n\n`;

        for (const plugin of plugins) {
            const toolCount = plugin.tools ? Object.keys(plugin.tools).length : 0;
            const cmdCount = plugin.commands ? Object.keys(plugin.commands).length : 0;
            msg += `• **${plugin.name}** v${plugin.version}\n`;
            msg += `  ${plugin.description}\n`;
            msg += `  _${cmdCount} commands, ${toolCount} AI tools_\n\n`;
        }

        await ctx.message.reply(msg);
        return true;
    }

    /**
     * Show health status
     */
    async showHealth(ctx) {
        if (!this.healthMonitor) {
            await ctx.message.reply('❌ Health monitor not available');
            return true;
        }

        const report = this.healthMonitor.getHealthReport();
        await ctx.message.reply(report);
        return true;
    }

    /**
     * Handle backup commands
     */
    async handleBackup(ctx, args) {
        if (!ctx.isAdmin) {
            await ctx.message.reply('❌ Backup commands require admin privileges');
            return true;
        }

        if (!this.bot.backupManager) {
            await ctx.message.reply('❌ Backup manager not available');
            return true;
        }

        const subcommand = args[0]?.toLowerCase();

        if (!subcommand || subcommand === 'create' || subcommand === 'new') {
            // Create backup
            await ctx.message.sendTyping();
            const result = await this.bot.backupManager.createBackup();
            
            if (result.success) {
                await ctx.message.reply(
                    `✅ Backup created successfully!\n` +
                    `📁 File: \`${result.filename}\`\n` +
                    `📊 Size: ${result.sizeMB} MB\n` +
                    `🕐 Time: ${new Date(result.timestamp).toLocaleString()}`
                );
            } else {
                await ctx.message.reply(`❌ Backup failed: ${result.error}`);
            }
            return true;
        }

        if (subcommand === 'list') {
            // List backups
            const backups = this.bot.backupManager.listBackups();
            const dirSize = this.bot.backupManager.getBackupDirSize();

            if (backups.length === 0) {
                await ctx.message.reply('📦 No backups found');
                return true;
            }

            let msg = `📦 **Backups (${backups.length})** - Total: ${dirSize.totalMB} MB\n\n`;
            
            for (let i = 0; i < Math.min(backups.length, 10); i++) {
                const backup = backups[i];
                const date = new Date(backup.created).toLocaleString();
                msg += `${i + 1}. \`${backup.filename}\`\n`;
                msg += `   ${backup.sizeMB} MB - ${date}\n\n`;
            }

            if (backups.length > 10) {
                msg += `_... and ${backups.length - 10} more_`;
            }

            await ctx.message.reply(msg);
            return true;
        }

        if (subcommand === 'delete' && args[1]) {
            // Delete backup
            const result = this.bot.backupManager.deleteBackup(args[1]);
            
            if (result.success) {
                await ctx.message.reply(`✅ Backup deleted: ${args[1]}`);
            } else {
                await ctx.message.reply(`❌ Failed to delete backup: ${result.error}`);
            }
            return true;
        }

        // Show help
        await ctx.message.reply(
            `📦 **Backup Commands**\n\n` +
            `• \`${this.config.commandPrefix}backup\` - Create a new backup\n` +
            `• \`${this.config.commandPrefix}backup list\` - List all backups\n` +
            `• \`${this.config.commandPrefix}backup delete <filename>\` - Delete a backup\n\n` +
            `_Note: Backups are automatically created every 6 hours_`
        );
        return true;
    }

    /**
     * Handle AI conversation with tool use
     */
    async handleAIConversation(ctx) {
        const { content, userId, platform, reply, sendTyping } = ctx.message;
        const requestId = ctx.requestId || 'unknown';

        await sendTyping();

        // Get minimal conversation history (only last message for very limited context)
        // This prevents the AI from referencing old conversations
        const history = await this.memory.getConversationHistory(userId, platform, 1);

        // Get available tools from plugins
        const tools = this.pluginRegistry.getAITools(ctx.isAdmin);

        // Build system prompt
        const systemPrompt = this.buildSystemPrompt(ctx);

        // Get AI response with timeout (60 seconds)
        // Don't include conversation history to prevent referencing previous messages
        try {
            const response = await withTimeout(
                this.aiManager.chat({
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content },
                    ],
                    tools,
                    onToolCall: async (toolCall) => {
                        return this.executeToolCall(ctx, toolCall);
                    },
                }),
                60000,
                'AI request timed out'
            );

            // Save to conversation history
            await this.memory.addToConversation(userId, platform, 'user', content);
            await this.memory.addToConversation(userId, platform, 'assistant', response);

            // Send response
            await reply(response);
        } catch (error) {
            logger.error(`[${requestId}] AI conversation failed:`, error);
            await reply('❌ AI request failed. Please try again.');
        }
    }

    /**
     * Build system prompt for AI
     */
    buildSystemPrompt(ctx) {
        const { userId, platform } = ctx.message;
        const os = require('os');

        // Get available tools for this user
        const tools = this.pluginRegistry.getAITools(ctx.isAdmin);
        const toolList = tools.map(t => `- ${t.name}: ${t.description}`).join('\n');

        // Get current timestamp
        const now = new Date();
        const timestamp = now.toISOString();
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

        // Build comprehensive system prompt
        let prompt = `# ${this.config.botName} - Agent System Prompt

## Identity
You are ${this.config.botName}, an AI assistant with full system access. You can execute commands, manage files, search the web, send emails, set reminders, and more.

${this.config.systemPrompt ? `## Personality\n${this.config.systemPrompt}\n` : ''}

## Response Style
- Be concise. Max 2-3 sentences for casual chat.
- For tasks: execute silently, report results briefly.
- Don't list capabilities unprompted.
- Don't ask "anything else?" after completing tasks.
- Recognize casual acknowledgments (okay, thanks, cool, got it, alright) - just acknowledge briefly, don't take action.
- CRITICAL: Focus ONLY on the current message. NEVER reference previous conversations, past messages, or earlier context.
- If user says "hey" or "hi", just say "hey" or "hi" back. Nothing else.
- If user asks a simple question, answer ONLY that question. Don't add extra information from previous conversations.
- Treat each message as completely independent - ignore conversation history unless the user explicitly references it.
- Don't volunteer information from previous messages. Only use what's in the current message.

## Available Tools
${toolList}

## Current Context
- Platform: ${platform}
- User ID: ${userId}
- Admin: ${ctx.isAdmin ? 'Yes (full access)' : 'No (limited tools)'}

## Runtime Environment
- OS: ${os.platform()} ${os.arch()}
- Hostname: ${os.hostname()}
- Working Directory: ${process.cwd()}
- Home Directory: ${os.homedir()}
- Node Version: ${process.version}

## Timestamp
- Current Time: ${timestamp}
- Timezone: ${timezone}
- Local: ${now.toLocaleString()}

## Capabilities
You have FULL OS access via tools:
- Read/write/delete/move files
- Execute shell commands
- Open files with default apps
- Set reminders and schedules
- Search web and news
- Send emails (if configured)
- Remember information across sessions

## Tool Usage
- Execute tools when the user asks you to do something
- For file paths on Windows, use backslashes or forward slashes
- Always report success/failure after tool use
- If something fails, explain why and suggest alternatives

## Scheduling / Cron
- ONLY set reminders when the user EXPLICITLY asks for one (e.g., "remind me in 10s to eat food")
- DO NOT set reminders for casual responses like "okay", "thanks", "cool", "got it", "alright", etc.
- These are acknowledgments, not commands to set reminders
- If you just set a reminder and the user says "okay" or "thanks", just acknowledge briefly - don't set another reminder
- For "remind me in X" requests, use setReminder with the delay parameter (e.g., "10s", "5m", "2h")
- For recurring tasks, advise user to set up external cron

## Safety
- Confirm before destructive operations (delete, overwrite)
- Don't execute obviously dangerous commands
- Respect user's admin status
`;

        // Add relevant memories (only if explicitly needed, not for every message)
        // Only include memories if the user is asking about something that might need them
        const memories = this.memory.getRelevantMemories(userId, platform);
        if (memories && memories.length > 0) {
            const contentLower = ctx.message.content.toLowerCase();
            const needsMemory = contentLower.includes('remember') || 
                              contentLower.includes('what did') || 
                              contentLower.includes('tell me about') ||
                              contentLower.includes('my name') ||
                              contentLower.includes('who am i') ||
                              contentLower.includes('what do you know');
            
            if (needsMemory && memories.length > 0) {
                prompt += `\n## User Memories (only use if directly relevant)\n`;
                for (const mem of memories) {
                    prompt += `- ${mem.content}\n`;
                }
            }
        }

        return prompt;
    }

    /**
     * Execute a tool call from AI
     */
    async executeToolCall(ctx, toolCall) {
        const { name, arguments: args } = toolCall;

        logger.info(`Executing tool: ${name}`, args);

        // Validate tool call
        if (!name || typeof name !== 'string') {
            return { error: 'Invalid tool name' };
        }

        const tool = this.pluginRegistry.getTool(name);
        if (!tool) {
            logger.warn(`Tool not found: ${name}`);
            return { error: `Tool not found: ${name}` };
        }

        // Check admin requirement
        if (tool.requiresAdmin && !ctx.isAdmin) {
            logger.warn(`Admin required for tool: ${name}, user: ${ctx.message.userId}`);
            return { error: 'This tool requires admin privileges' };
        }

        // Validate arguments if tool has parameter schema
        if (tool.parameters && args) {
            try {
                this.validateToolArguments(tool.parameters, args);
            } catch (validationError) {
                logger.warn(`Tool argument validation failed for ${name}:`, validationError);
                return { error: `Invalid arguments: ${validationError.message}` };
            }
        }

        try {
            // Execute tool with timeout (30 seconds for tools)
            const result = await withTimeout(
                tool.execute(args, ctx),
                30000,
                `Tool ${name} timed out`
            );
            return { success: true, result };
        } catch (error) {
            const requestId = ctx.requestId || 'unknown';
            logger.error(`[${requestId}] Tool ${name} failed:`, error);
            // Don't expose full error stack to AI, just the message
            return { error: error.message || 'Tool execution failed' };
        }
    }

    /**
     * Validate tool arguments against parameter schema
     */
    validateToolArguments(parameters, args) {
        for (const [paramName, paramDef] of Object.entries(parameters)) {
            const value = args[paramName];

            // Check required parameters
            if (paramDef.required && (value === undefined || value === null)) {
                throw new Error(`Missing required parameter: ${paramName}`);
            }

            // Type validation
            if (value !== undefined && value !== null && paramDef.type) {
                const expectedType = paramDef.type.toLowerCase();
                const actualType = typeof value;

                if (expectedType === 'string' && actualType !== 'string') {
                    throw new Error(`Parameter ${paramName} must be a string`);
                }
                if (expectedType === 'number' && actualType !== 'number') {
                    throw new Error(`Parameter ${paramName} must be a number`);
                }
                if (expectedType === 'boolean' && actualType !== 'boolean') {
                    throw new Error(`Parameter ${paramName} must be a boolean`);
                }
            }
        }
    }
}

module.exports = MessageRouter;
