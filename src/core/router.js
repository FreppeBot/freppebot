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

// Wrench error handler (lazy loaded to avoid circular dependencies)
let wrenchModule = null;
const getWrenchHandler = () => {
    if (!wrenchModule) {
        try {
            wrenchModule = require('../../plugins/core/wrench');
        } catch (e) {
            logger.debug('Wrench module not loaded yet');
        }
    }
    return wrenchModule?.getWrenchHandler?.() || null;
};

class MessageRouter {
    constructor({ bot, pluginRegistry, aiManager, memory, config, healthMonitor }) {
        this.bot = bot;
        this.pluginRegistry = pluginRegistry;
        this.aiManager = aiManager;
        this.memory = memory;
        this.config = config;
        this.healthMonitor = healthMonitor;
        
        // Track wrench retry attempts per request (max 3)
        this.wrenchRetries = new Map(); // requestId -> count

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
     * Check if a message might be an API key response
     */
    isLikelyAPIKey(content) {
        // API keys are typically long alphanumeric strings
        const trimmed = content.trim();
        // Check for common API key patterns
        const apiKeyPatterns = [
            /^sk-[a-zA-Z0-9]{32,}$/, // OpenAI style
            /^[a-zA-Z0-9]{32,}$/, // Generic long alphanumeric
            /^[a-zA-Z0-9_-]{20,}$/, // Generic with underscores/dashes
        ];
        return apiKeyPatterns.some(p => p.test(trimmed));
    }

    /**
     * Handle potential API key response from user
     */
    async handleAPIKeyResponse(ctx) {
        const wrenchHandler = getWrenchHandler();
        if (!wrenchHandler) return false;

        const userId = ctx.message.userId;
        
        // Check if user has a pending API key request
        if (!wrenchHandler.hasPendingKeyRequest(userId)) {
            return false;
        }

        const content = ctx.message.content.trim();
        
        // Validate it looks like an API key
        if (!this.isLikelyAPIKey(content)) {
            await ctx.message.reply('❌ That doesn\'t look like a valid API key. Please send just the API key.');
            return true; // Handled, but invalid
        }

        // Process the API key
        const result = wrenchHandler.handleReceivedAPIKey(userId, content);
        
        if (result.success) {
            // Store the API key securely (in memory for this session)
            // In a production system, you'd want to encrypt and store this properly
            logger.info(`Received API key for ${result.service} from user ${userId}`);
            
            // Notify the user
            await ctx.message.reply(
                `✅ API key for **${result.service}** received!\n\n` +
                `The key has been stored for this session. ` +
                `To make it permanent, add it to your config.json or environment variables:\n` +
                `\`${result.envVars[0]}=your_key_here\``
            );
            
            // Store in bot config temporarily
            if (this.bot && this.bot.config) {
                const keyName = `${result.service.toLowerCase()}Key`;
                this.bot.config[keyName] = result.apiKey;
                logger.info(`Stored ${result.service} API key in runtime config`);
            }
            
            return true;
        } else {
            await ctx.message.reply(`❌ ${result.error}`);
            return true;
        }
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
            // Check if this is an API key response (for wrench)
            if (this.isLikelyAPIKey(content)) {
                const handled = await this.handleAPIKeyResponse(ctx);
                if (handled) return;
            }

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
            
            // Try to use wrench to diagnose and suggest fixes (max 3 attempts)
            const wrenchHandler = getWrenchHandler();
            let wrenchMessage = '';
            
            if (wrenchHandler) {
                const retryCount = this.wrenchRetries.get(requestId) || 0;
                
                if (retryCount < 3) {
                    try {
                        logger.info(`[${requestId}] Wrench analyzing error... (attempt ${retryCount + 1}/3)`);
                        this.wrenchRetries.set(requestId, retryCount + 1);
                        
                        const resolution = await wrenchHandler.resolveError(error.message || error, ctx, {
                            autoFix: false,
                            autoExecute: false,
                        });
                        
                        // Only add to message if this is the final attempt
                        if (retryCount === 2) {
                            if (resolution.message) {
                                wrenchMessage = `\n\n🔧 **Diagnosis:**\n${resolution.message}`;
                            }
                            
                            if (resolution.suggestedCommand || resolution.installCommand) {
                                wrenchMessage += `\n\n**Suggested Fix:**\n\`\`\`bash\n${resolution.suggestedCommand || resolution.installCommand}\n\`\`\``;
                            }
                        } else {
                            // Log silently for first 2 attempts
                            logger.debug(`[${requestId}] Wrench attempt ${retryCount + 1}: ${resolution.message || 'No resolution'}`);
                        }
                    } catch (wrenchError) {
                        logger.warn(`[${requestId}] Wrench failed: ${wrenchError.message}`);
                        if (retryCount === 2) {
                            wrenchMessage = `\n\n❌ Unable to diagnose error after 3 attempts.`;
                        }
                    }
                } else {
                    // Max retries reached - send final error
                    wrenchMessage = `\n\n❌ Error resolution failed after 3 attempts.`;
                    this.wrenchRetries.delete(requestId);
                }
            }
            
            // Provide more helpful error messages
            let errorMessage = '❌ Sorry, something went wrong.';
            if (error.message && !error.message.includes('timed out')) {
                // Don't expose timeout details to users
                errorMessage += ` ${error.message}`;
            }
            
            errorMessage += wrenchMessage;
            
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
     * Check if message is a casual greeting that shouldn't trigger tools
     */
    isCasualGreeting(content) {
        const normalized = content.trim().toLowerCase();
        const casualGreetings = [
            'hey', 'hi', 'hello', 'hiya', 'hey there', 'hey!', 'hi!', 'hello!',
            'what\'s up', 'whats up', 'sup', 'yo', 'howdy', 'greetings',
            'morning', 'afternoon', 'evening', 'good morning', 'good afternoon', 'good evening'
        ];
        return casualGreetings.includes(normalized) || casualGreetings.some(g => normalized.startsWith(g + ' ') || normalized === g);
    }

    /**
     * Handle AI conversation with tool use
     */
    async handleAIConversation(ctx) {
        const { content, userId, platform, reply, sendTyping } = ctx.message;
        const requestId = ctx.requestId || 'unknown';

        await sendTyping();

        // Block tool execution during startup grace period to prevent old tasks from running
        if (this.bot && this.bot.startupTime) {
            const timeSinceStartup = Date.now() - this.bot.startupTime;
            if (timeSinceStartup < this.bot.startupGracePeriod) {
                logger.warn(`⚠️ Blocked tool execution during startup grace period (${Math.round(timeSinceStartup)}ms since startup)`);
                await reply('Bot is still initializing. Please wait a moment and try again.');
                return;
            }
        }

        // For casual greetings, respond without tools to prevent executing old tasks
        if (this.isCasualGreeting(content)) {
            const greetings = ['Hey!', 'Hi!', 'Hello!', 'Hey there!', 'Hi there!'];
            const response = greetings[Math.floor(Math.random() * greetings.length)];
            await reply(response);
            // Don't save casual greetings to conversation history to prevent context leakage
            return;
        }

        // Get available tools from plugins
        const tools = this.pluginRegistry.getAITools(ctx.isAdmin);

        // Build system prompt
        const systemPrompt = this.buildSystemPrompt(ctx);

        // Get recent conversation history (last 2 messages) for context
        // This allows the AI to understand confirmations like "yes" after asking questions
        const recentHistory = await this.memory.getConversationHistory(userId, platform, 2);
        
        // Build messages array with recent context
        const messages = [
            { role: 'system', content: systemPrompt },
        ];
        
        // Add recent conversation history if available (helps with confirmations)
        if (recentHistory && recentHistory.length > 0) {
            messages.push(...recentHistory);
        }
        
        // Add current user message
        messages.push({ role: 'user', content });
        
        // Get AI response with timeout (60 seconds)
        try {
            const response = await withTimeout(
                this.aiManager.chat({
                    messages,
                    tools,
                    onToolCall: async (toolCall) => {
                        // Send immediate acknowledgment before executing tool
                        await this.sendToolAcknowledgment(ctx, toolCall);
                        return this.executeToolCall(ctx, toolCall);
                    },
                }),
                60000,
                'AI request timed out'
            );

            // Save to conversation history
            await this.memory.addToConversation(userId, platform, 'user', content);
            await this.memory.addToConversation(userId, platform, 'assistant', response);

            // Clean up wrench retries for this request
            this.wrenchRetries.delete(requestId);

            // Send response
            await reply(response);
        } catch (error) {
            logger.error(`[${requestId}] AI conversation failed:`, error);
            
            // Clean up wrench retries
            this.wrenchRetries.delete(requestId);
            
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
- For tasks: ALWAYS send an acknowledgment message FIRST before executing tools (e.g., "📥 Downloading video...", "🎨 Generating image...", "⏰ Setting reminder...")
- After sending acknowledgment, execute the tool silently, then report results briefly.
- Don't list capabilities unprompted.
- Don't ask "anything else?" after completing tasks.
- Recognize casual acknowledgments (okay, thanks, cool, got it, alright) - just acknowledge briefly, don't take action.
- IMPORTANT: If you just asked a question (e.g., "Want me to send it to you?") and the user responds with "yes", "yeah", "sure", "ok", "please", etc., EXECUTE THE REQUESTED ACTION using the appropriate tool.
- For example: If you asked "Want me to send it?" and user says "yes", use the sendVideo tool with the file path from the previous context.
- CRITICAL: Focus on the current message, but use recent conversation context to understand confirmations and follow-up requests.
- If user says "hey" or "hi", just say "hey" or "hi" back. DO NOT execute any tools. DO NOT continue previous tasks.
- If user asks a simple question, answer ONLY that question. Don't add extra information from previous conversations.
- When the user confirms a question you just asked (like "yes" after "Want me to send it?"), execute the action immediately.
- CRITICAL: DO NOT execute tools unless the user EXPLICITLY asks you to do something OR confirms a question you just asked.
- If the user just says "hey", "hi", or any casual greeting, respond with a greeting ONLY. Do not execute any tools or continue any previous tasks.

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
- ONLY execute tools when the user EXPLICITLY asks you to do something in the CURRENT message
- DO NOT execute tools for casual greetings like "hey", "hi", "hello", "what's up"
- DO NOT continue or complete tasks from previous messages unless the user explicitly asks you to
- DO NOT assume the user wants you to complete old tasks just because they send a message
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
     * Send immediate acknowledgment when a tool is about to execute
     */
    async sendToolAcknowledgment(ctx, toolCall) {
        const { name } = toolCall;
        const tool = this.pluginRegistry.getTool(name);
        
        if (!tool) return;

        // Generate user-friendly acknowledgment message
        const toolName = name.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
        // Don't send automatic acknowledgments - let AI handle it
        // Only send for non-video tools that need immediate feedback
        const silentTools = [
            'downloadVideo', 'downloadAndClipVideo', 'clipVideoFromMiddle', 
            'sendVideo', 'generateImage', 'generateAndSaveImage'
        ];
        
        if (silentTools.includes(name)) {
            // Let AI send the acknowledgment message
            return;
        }

        const acknowledgments = {
            'setReminder': '⏰ Setting reminder...',
            'createGitHubRepository': '🔨 Creating GitHub repository...',
            'editGitHubFile': '✏️ Editing file...',
            'getGitHubFile': '📄 Getting file...',
            'deleteGitHubFile': '🗑️ Deleting file...',
            'gitAdd': '📝 Staging files...',
            'gitCommit': '💾 Committing changes...',
            'gitPush': '🚀 Pushing to repository...',
            'initializeGitRepository': '🔧 Initializing repository...',
            'createFolder': '📁 Creating folder...',
            'createFile': '📝 Creating file...',
        };

        const message = acknowledgments[name];
        if (message) {
            // Send acknowledgment immediately (non-blocking)
            ctx.message.reply(message).catch(error => {
                logger.warn(`Failed to send tool acknowledgment for ${name}: ${error.message}`);
            });
        }
    }

    /**
     * Execute a tool call from AI
     */
    async executeToolCall(ctx, toolCall) {
        const { name, arguments: args } = toolCall;

        logger.info(`Executing tool: ${name}`, JSON.stringify(args));

        // Validate tool call
        if (!name || typeof name !== 'string') {
            logger.error(`Invalid tool name: ${name}`);
            return { error: 'Invalid tool name' };
        }

        const tool = this.pluginRegistry.getTool(name);
        if (!tool) {
            logger.warn(`Tool not found: ${name}`);
            return { error: `Tool not found: ${name}` };
        }
        
        logger.info(`Tool found: ${name}, has execute function: ${typeof tool.execute === 'function'}`);

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
            logger.info(`Calling tool.execute for ${name} with args:`, JSON.stringify(args));
            // Execute tool with timeout (30 seconds for tools)
            const result = await withTimeout(
                tool.execute(args, ctx),
                30000,
                `Tool ${name} timed out`
            );
            logger.info(`Tool ${name} executed successfully, result:`, JSON.stringify(result));
            return { success: true, result };
        } catch (error) {
            const requestId = ctx.requestId || 'unknown';
            logger.error(`[${requestId}] Tool ${name} failed:`, error);
            logger.error(`[${requestId}] Tool ${name} error stack:`, error.stack);
            
            // Try to use wrench to diagnose and potentially fix the error (max 3 attempts)
            const wrenchHandler = getWrenchHandler();
            if (wrenchHandler) {
                const retryKey = `${requestId}_${name}`;
                const retryCount = this.wrenchRetries.get(retryKey) || 0;
                
                if (retryCount < 3) {
                    try {
                        logger.info(`[${requestId}] Wrench analyzing error for tool ${name}... (attempt ${retryCount + 1}/3)`);
                        this.wrenchRetries.set(retryKey, retryCount + 1);
                        
                        const resolution = await wrenchHandler.resolveError(error.message || error, ctx, {
                            autoFix: ctx.isAdmin && retryCount === 2, // Only auto-fix on final attempt for admins
                            autoExecute: false, // Don't auto-execute from tool errors (safety)
                        });
                        
                        if (resolution.handled) {
                            logger.info(`[${requestId}] Wrench handled the error for tool ${name}`);
                            this.wrenchRetries.delete(retryKey);
                            return {
                                error: error.message || 'Tool execution failed',
                                wrenchResolution: resolution,
                                wrenchHandled: true,
                            };
                        }
                        
                        // Only return suggestions on final attempt
                        if (retryCount === 2) {
                            this.wrenchRetries.delete(retryKey);
                            return {
                                error: error.message || 'Tool execution failed',
                                wrenchDiagnosis: resolution.message,
                                wrenchSuggestion: resolution.suggestedCommand || resolution.installCommand,
                                wrenchCategory: resolution.category,
                            };
                        } else {
                            // Return simple error for first 2 attempts (no wrench spam)
                            return { error: error.message || 'Tool execution failed' };
                        }
                    } catch (wrenchError) {
                        logger.warn(`[${requestId}] Wrench failed to analyze error: ${wrenchError.message}`);
                        if (retryCount === 2) {
                            this.wrenchRetries.delete(retryKey);
                        }
                    }
                } else {
                    // Max retries reached
                    this.wrenchRetries.delete(retryKey);
                    logger.warn(`[${requestId}] Wrench max retries reached for tool ${name}`);
                }
            }
            
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
