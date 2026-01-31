/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     FREPPEBOT CORE ENGINE                      ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const cron = require('node-cron');
const PluginLoader = require('../plugins/loader');
const PluginRegistry = require('../plugins/registry');
const AIManager = require('../ai/manager');
const Database = require('../storage/database');
const MemoryStore = require('../storage/memory');
const MessageRouter = require('./router');
const HealthMonitor = require('../utils/health');
const BackupManager = require('../utils/backup');
const logger = require('../utils/logger');
const path = require('path');

// Adapters
const DiscordAdapter = require('../adapters/discord');
const TelegramAdapter = require('../adapters/telegram');

class FreppeBot {
    constructor(config) {
        this.config = this.normalizeConfig(config);
        this.adapters = [];
        this.pluginRegistry = new PluginRegistry();
        this.pluginLoader = null;
        this.aiManager = null;
        this.database = null;
        this.memory = null;
        this.router = null;
        this.healthMonitor = null;
        this.backupManager = null;
        this.reminderCronTask = null;
        this.backupInterval = null;
        this.startupTime = null;
        this.startupGracePeriod = 5000; // 5 seconds
    }

    /**
     * Normalize config from JSON format to internal format
     */
    normalizeConfig(config) {
        return {
            botName: config.bot?.name || 'FreppeBot',
            commandPrefix: config.bot?.commandPrefix || '!',
            logLevel: config.bot?.logLevel || 'info',
            systemPrompt: config.bot?.systemPrompt || '',

            // AI settings
            defaultProvider: config.ai?.defaultProvider || 'openrouter',
            defaultModel: config.ai?.defaultModel || 'anthropic/claude-3.5-sonnet',
            openrouterKey: config.ai?.openrouterKey,
            openaiKey: config.ai?.openaiKey,
            anthropicKey: config.ai?.anthropicKey,
            kimiKey: config.ai?.kimiKey,

            // Plugin settings
            pluginHotReload: config.plugins?.hotReload !== false,
            disabledPlugins: config.plugins?.disabled || [],

            // Platform settings
            discord: config.platforms?.discord ? {
                enabled: config.platforms.discord.enabled !== false,
                token: config.platforms.discord.token,
                allowedUsers: config.platforms.discord.allowedUsers || [],
                adminUsers: config.platforms.discord.adminUsers || [],
            } : { enabled: false },

            telegram: config.platforms?.telegram ? {
                enabled: config.platforms.telegram.enabled !== false,
                token: config.platforms.telegram.token,
                allowedUsers: config.platforms.telegram.allowedUsers || [],
                adminUsers: config.platforms.telegram.adminUsers || [],
            } : { enabled: false },

            // Plugin-specific config (like Twitter)
            plugins: config.plugins || {},
        };
    }

    async initialize() {
        logger.info('Initializing FreppeBot...');

        // Initialize database (sql.js - pure JavaScript)
        this.database = new Database();
        await this.database.initialize();
        logger.info('✓ Database initialized (sql.js)');

        // Initialize backup manager
        const dbPath = path.join(process.cwd(), 'data', 'freppebot.db');
        this.backupManager = new BackupManager(this.database, dbPath);
        logger.info('✓ Backup manager initialized');

        // Initialize memory store
        this.memory = new MemoryStore(this.database);
        logger.info('✓ Memory store initialized');

        // Initialize AI manager
        this.aiManager = new AIManager(this.config);
        await this.aiManager.initialize();
        logger.info('✓ AI manager initialized');

        // Initialize plugin loader
        this.pluginLoader = new PluginLoader(this.pluginRegistry, {
            hotReload: this.config.pluginHotReload,
            disabledPlugins: this.config.disabledPlugins,
        });
        await this.pluginLoader.loadPlugins();
        logger.info(`✓ Loaded ${this.pluginRegistry.getPluginCount()} plugins`);

        // Initialize health monitor
        this.healthMonitor = new HealthMonitor(this);
        logger.info('✓ Health monitor initialized');

        // Initialize message router
        this.router = new MessageRouter({
            bot: this,
            pluginRegistry: this.pluginRegistry,
            aiManager: this.aiManager,
            memory: this.memory,
            config: this.config,
            healthMonitor: this.healthMonitor,
        });
        logger.info('✓ Message router initialized');

        // Initialize adapters
        await this.initializeAdapters();
    }

    async initializeAdapters() {
        // Discord
        if (this.config.discord.enabled && this.config.discord.token) {
            const discord = new DiscordAdapter(this.config.discord, this.router);
            this.adapters.push(discord);
            logger.info('✓ Discord adapter initialized');
        }

        // Telegram
        if (this.config.telegram.enabled && this.config.telegram.token) {
            const telegram = new TelegramAdapter(this.config.telegram, this.router);
            this.adapters.push(telegram);
            logger.info('✓ Telegram adapter initialized');
        }

        if (this.adapters.length === 0) {
            throw new Error('No messaging adapters enabled! Run `npm run setup` to configure.');
        }
    }

    async start() {
        // Clear conversation history FIRST, before starting anything
        // This ensures each bot restart starts with a clean slate and prevents old tasks from executing
        this.database.clearAllConversations();
        logger.info('✓ Cleared conversation history (fresh start)');

        // Set startup time to prevent tool execution during initial period
        this.startupTime = Date.now();
        this.startupGracePeriod = 5000; // 5 seconds grace period after startup

        logger.info('Starting adapters...');

        for (const adapter of this.adapters) {
            await adapter.start();
            logger.info(`✓ ${adapter.name} started`);
        }

        // Start reminder checker
        this.startReminderChecker();
        logger.info('✓ Reminder checker started');

        // Start automatic backups (every 6 hours)
        this.startAutomaticBackups();
        logger.info('✓ Automatic backups enabled (every 6 hours)');

        // Log database stats
        const stats = this.database.getStats();
        logger.info(`📊 Database: ${stats.totalMessages} messages, ${stats.uniqueUsers} users, ${stats.totalMemories} memories`);
    }

    /**
     * Clean up old reminders that are past their due date (older than 1 hour)
     * This prevents processing stale reminders on startup
     */
    async cleanupOldReminders() {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        
        const stmt = this.database.db.prepare(`
            SELECT COUNT(*) as count FROM reminders 
            WHERE datetime(remind_at) < datetime(?) AND completed = 0
        `);
        stmt.bind([oneHourAgo]);
        
        let oldCount = 0;
        if (stmt.step()) {
            oldCount = stmt.getAsObject().count;
        }
        stmt.free();
        
        if (oldCount > 0) {
            logger.info(`🧹 Cleaning up ${oldCount} old reminder(s) that are more than 1 hour past due`);
            
            const updateStmt = this.database.db.prepare(`
                UPDATE reminders SET completed = 1 
                WHERE datetime(remind_at) < datetime(?) AND completed = 0
            `);
            updateStmt.run([oneHourAgo]);
            updateStmt.free();
            
            logger.info(`✅ Marked ${oldCount} old reminder(s) as completed`);
        }
    }

    /**
     * Check for due reminders using cron (every 5 seconds)
     */
    startReminderChecker() {
        logger.info('⏰ Starting reminder checker with cron (checking every 5 seconds)');
        logger.info('⏰ Reminder checker function called - initializing...');
        
        // Clean up old reminders first
        this.cleanupOldReminders().catch(err => {
            logger.error('❌ Old reminder cleanup error:', err);
        });
        
        // Check immediately on start (after cleanup)
        setTimeout(() => {
            this.checkDueReminders().catch(err => {
                logger.error('❌ Initial reminder check error:', err);
            });
        }, 1000); // Wait 1 second after cleanup
        
        // Schedule cron job to run every 5 seconds
        // Cron format: second minute hour day month weekday
        // '*/5 * * * * *' means every 5 seconds
        this.reminderCronTask = cron.schedule('*/5 * * * * *', async () => {
            try {
                // Log every cron trigger for debugging (can reduce frequency later)
                if (Math.random() < 0.2) { // 20% chance to log
                    logger.info('⏰ Cron job triggered - checking reminders');
                }
                await this.checkDueReminders();
            } catch (err) {
                logger.error('❌ Reminder checker error:', err);
                logger.error(err.stack);
            }
        }, {
            scheduled: true,
            timezone: 'UTC'
        });
        
        logger.info('✅ Reminder checker cron job started');
    }

    async checkDueReminders() {
        const now = new Date().toISOString();
        const nowDate = new Date();

        // Log every check for debugging (can be reduced later)
        // Using info level so we can see if the checker is running
        if (Math.random() < 0.2) { // 20% chance to log each check
            logger.info(`⏰ Checking for due reminders. Now: ${now}`);
        }

        // Get all due reminders (remind_at <= now) that haven't been completed
        // The cleanup function handles very old reminders, so we can process all due ones
        logger.info(`🔍 Querying for due reminders: remind_at <= ${now}`);
        const stmt = this.database.db.prepare(`
            SELECT * FROM reminders 
            WHERE datetime(remind_at) <= datetime(?)
            AND completed = 0
            ORDER BY remind_at ASC
        `);
        stmt.bind([now]);

        const reminders = [];
        while (stmt.step()) {
            const reminder = stmt.getAsObject();
            reminders.push(reminder);
            logger.info(`✅ Found due reminder: ID=${reminder.id}, message="${reminder.message}", remind_at=${reminder.remind_at}`);
        }
        stmt.free();
        
        logger.info(`📊 SQL query returned ${reminders.length} due reminder(s) out of ${allPending.length} pending`);

        // Also check all pending reminders for debugging
        const allPendingStmt = this.database.db.prepare(`
            SELECT * FROM reminders WHERE completed = 0 ORDER BY remind_at ASC LIMIT 5
        `);
        const allPending = [];
        while (allPendingStmt.step()) {
            allPending.push(allPendingStmt.getAsObject());
        }
        allPendingStmt.free();

        // Log pending reminders for debugging (always log if there are any)
        if (allPending.length > 0) {
            logger.info(`📋 Pending reminders (${allPending.length}):`);
            for (const r of allPending) {
                const remindDate = new Date(r.remind_at);
                const diffMs = remindDate - nowDate;
                const diffSec = Math.floor(diffMs / 1000);
                const status = diffSec <= 0 ? 'DUE NOW' : `in ${diffSec}s`;
                logger.info(`  - Reminder ${r.id}: "${r.message}" (Due: ${r.remind_at}, ${status})`);
            }
        } else {
            logger.debug(`📋 No pending reminders found`);
        }

        if (reminders.length > 0) {
            logger.info(`🔔 Found ${reminders.length} due reminder(s). Now: ${now}`);
            for (const r of reminders) {
                const remindDate = new Date(r.remind_at);
                const diffMs = nowDate - remindDate;
                const diffSec = Math.floor(diffMs / 1000);
                logger.info(`  - Reminder ${r.id}: "${r.message}" (Due: ${r.remind_at}, ${diffSec}s ago)`);
            }
        } else {
            // Log that checker is running (more frequently for debugging)
            if (Math.random() < 0.1) { // 10% chance to log (increased for debugging)
                logger.debug(`⏰ Reminder checker running (no due reminders at ${now})`);
            }
        }

        for (const reminder of reminders) {
            logger.info(`Processing reminder ${reminder.id}: ${reminder.message} (Due: ${reminder.remind_at})`);

            // Find the right adapter and send notification
            const adapter = this.adapters.find(a => a.platform === reminder.platform);
            if (adapter) {
                try {
                    const sent = await this.sendReminderNotification(adapter, reminder);
                    if (sent) {
                        // Mark as completed only after successful send
                        const updateStmt = this.database.db.prepare(`
                            UPDATE reminders SET completed = 1 WHERE id = ?
                        `);
                        updateStmt.run([reminder.id]);
                        updateStmt.free();
                        logger.info(`✅ Reminder sent to ${reminder.user_id}: ${reminder.message}`);
                    } else {
                        logger.warn(`⚠️ Failed to send reminder ${reminder.id}, will retry next check`);
                    }
                } catch (err) {
                    logger.error(`❌ Failed to send reminder ${reminder.id}:`, err);
                    // Don't mark as completed if send failed, so it retries
                }
            } else {
                logger.warn(`⚠️ No adapter found for platform: ${reminder.platform}`);
                // Mark as completed if adapter doesn't exist (can't send anyway)
                const updateStmt = this.database.db.prepare(`
                    UPDATE reminders SET completed = 1 WHERE id = ?
                `);
                updateStmt.run([reminder.id]);
                updateStmt.free();
            }
        }
    }

    async sendReminderNotification(adapter, reminder) {
        const message = `⏰ **Reminder:** ${reminder.message}`;
        const logger = require('../utils/logger');

        logger.info(`📤 Attempting to send reminder ${reminder.id} to ${reminder.platform} user ${reminder.user_id}`);

        try {
            if (adapter.platform === 'telegram') {
                // Telegram: Try to send to chat ID (channel_id) if available, otherwise user_id
                const chatId = reminder.channel_id || reminder.user_id;
                logger.debug(`Sending Telegram reminder to chat ${chatId}`);
                try {
                    await adapter.bot.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' });
                    logger.info(`✅ Telegram reminder sent successfully to ${chatId}`);
                    return true;
                } catch (err) {
                    // If markdown fails, try plain text
                    try {
                        await adapter.bot.telegram.sendMessage(chatId, message);
                        logger.info(`✅ Telegram reminder sent (plain text) to ${chatId}`);
                        return true;
                    } catch (err2) {
                        logger.error(`❌ Telegram reminder send failed: ${err2.message}`);
                        return false;
                    }
                }
            } else if (adapter.platform === 'discord') {
                // Discord: Try channel first (if available), then DM
                if (reminder.channel_id) {
                    try {
                        logger.debug(`Trying to send Discord reminder to channel ${reminder.channel_id}`);
                        const channel = await adapter.client.channels.fetch(reminder.channel_id);
                        if (channel) {
                            await channel.send(message);
                            logger.info(`✅ Discord reminder sent to channel ${reminder.channel_id}`);
                            return true;
                        }
                    } catch (err) {
                        logger.debug(`Could not send to channel ${reminder.channel_id}, trying DM: ${err.message}`);
                    }
                }

                // Fallback to DM
                try {
                    logger.debug(`Trying to send Discord reminder via DM to ${reminder.user_id}`);
                    const user = await adapter.client.users.fetch(reminder.user_id);
                    if (user) {
                        await user.send(message);
                        logger.info(`✅ Discord reminder sent via DM to ${reminder.user_id}`);
                        return true;
                    }
                } catch (err) {
                    // Common Discord DM errors
                    if (err.code === 50007) {
                        logger.warn(`⚠️ Cannot send DM to ${reminder.user_id}: User has DMs disabled`);
                    } else {
                        logger.error(`❌ Discord reminder send failed: ${err.message} (code: ${err.code || 'N/A'})`);
                    }
                    return false;
                }
            }
        } catch (error) {
            logger.error(`❌ Unexpected error sending reminder: ${error.message}`);
            logger.error(error.stack);
            return false;
        }

        logger.warn(`⚠️ No handler found for platform: ${adapter.platform}`);
        return false;
    }

    /**
     * Start automatic backups
     */
    startAutomaticBackups() {
        // Create initial backup
        this.backupManager.createBackup().then(result => {
            if (result.success) {
                logger.info(`Initial backup created: ${result.filename} (${result.sizeMB}MB)`);
            }
        });

        // Schedule backups every 6 hours
        this.backupInterval = setInterval(async () => {
            const result = await this.backupManager.createBackup();
            if (result.success) {
                logger.info(`Automatic backup created: ${result.filename} (${result.sizeMB}MB)`);
            } else {
                logger.warn(`Automatic backup failed: ${result.error}`);
            }
        }, 6 * 60 * 60 * 1000); // 6 hours
    }

    async stop() {
        logger.info('Stopping FreppeBot...');

        // Stop reminder checker
        if (this.reminderCronTask) {
            this.reminderCronTask.stop();
            this.reminderCronTask = null;
        }

        // Stop automatic backups
        if (this.backupInterval) {
            clearInterval(this.backupInterval);
        }

        for (const adapter of this.adapters) {
            await adapter.stop();
            logger.info(`✓ ${adapter.name} stopped`);
        }

        if (this.pluginLoader) {
            await this.pluginLoader.unloadAll();
        }

        if (this.database) {
            await this.database.close();
        }

        logger.info('FreppeBot stopped');
    }

    // Expose methods for plugins
    getMemory() {
        return this.memory;
    }

    getAI() {
        return this.aiManager;
    }

    getDatabase() {
        return this.database;
    }

    getConfig() {
        return this.config;
    }

    getHealthMonitor() {
        return this.healthMonitor;
    }

    getBackupManager() {
        return this.backupManager;
    }
}

module.exports = FreppeBot;
