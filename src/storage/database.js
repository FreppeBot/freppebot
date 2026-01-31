/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     DATABASE (sql.js)                          ║
 * ║                                                                 ║
 * ║   Pure JavaScript SQLite - no native dependencies!            ║
 * ║   Stores all conversations, memories, and plugin data.        ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { retry } = require('../utils/retry');

class DatabaseManager {
  constructor(dbPath = null) {
    this.dbPath = dbPath || path.join(process.cwd(), 'data', 'freppebot.db');
    this.db = null;
    this.SQL = null;
    this.saveInterval = null;
  }

  async initialize() {
    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Initialize sql.js
    this.SQL = await initSqlJs();

    // Load existing database or create new one
    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(fileBuffer);
      logger.debug(`Database loaded from: ${this.dbPath}`);
    } else {
      this.db = new this.SQL.Database();
      logger.debug(`New database created: ${this.dbPath}`);
    }

    // Create tables
    this.createTables();

    // Auto-save every 30 seconds (fire and forget)
    this.saveInterval = setInterval(() => {
      this.save().catch(err => logger.error('Auto-save failed:', err));
    }, 30000);

    logger.debug('Database initialized');
  }

  createTables() {
    // Conversation history - stores ALL messages
    this.db.run(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Memory/facts storage
    this.db.run(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(user_id, platform, key)
      )
    `);

    // Reminders
    this.db.run(`
      CREATE TABLE IF NOT EXISTS reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        message TEXT NOT NULL,
        remind_at TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        completed INTEGER DEFAULT 0
      )
    `);

    // Migration: Add channel_id column if it doesn't exist (for existing databases)
    try {
      const tableInfo = this.db.exec(`PRAGMA table_info(reminders)`);
      const columns = tableInfo[0]?.values || [];
      const hasChannelId = columns.some(col => col[1] === 'channel_id');
      
      if (!hasChannelId) {
        this.db.run(`ALTER TABLE reminders ADD COLUMN channel_id TEXT`);
        logger.debug('Added channel_id column to reminders table');
      }
    } catch (err) {
      // Ignore errors, column might already exist
      logger.debug('Migration check for channel_id: ' + err.message);
    }

    // Plugin data storage
    this.db.run(`
      CREATE TABLE IF NOT EXISTS plugin_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plugin_name TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(plugin_name, key)
      )
    `);

    // Chat sessions (for grouping conversations)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        platform TEXT NOT NULL,
        started_at TEXT DEFAULT (datetime('now')),
        last_activity TEXT DEFAULT (datetime('now'))
      )
    `);

    // Create indexes for faster queries
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id, platform)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_conv_time ON conversations(created_at)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_mem_user ON memories(user_id, platform)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_remind_time ON reminders(remind_at)`);
  }

  /**
   * Save database to disk with retry logic
   */
  async save() {
    try {
      // Use retry logic for database saves
      await retry(
        () => {
          const data = this.db.export();
          const buffer = Buffer.from(data);
          fs.writeFileSync(this.dbPath, buffer);
          logger.debug('Database saved to disk');
        },
        {
          maxRetries: 2,
          initialDelay: 500,
          shouldRetry: (error) => {
            // Retry on write errors (disk full, permission issues, etc.)
            return error.code === 'ENOSPC' || error.code === 'EACCES' || error.code === 'EBUSY';
          },
        }
      );
    } catch (error) {
      logger.error('Failed to save database after retries:', error);
    }
  }

  /**
   * Add a message to conversation history
   */
  addConversation(userId, platform, role, content) {
    const stmt = this.db.prepare(`
      INSERT INTO conversations (user_id, platform, role, content)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run([userId, platform, role, content]);
    stmt.free();
  }

  /**
   * Get conversation history
   */
  getConversationHistory(userId, platform, limit = 10) {
    const stmt = this.db.prepare(`
      SELECT role, content, created_at
      FROM conversations
      WHERE user_id = ? AND platform = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    stmt.bind([userId, platform, limit]);

    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();

    return rows.reverse(); // Return in chronological order
  }

  /**
   * Get total message count for a user
   */
  getMessageCount(userId, platform) {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM conversations
      WHERE user_id = ? AND platform = ?
    `);
    stmt.bind([userId, platform]);
    stmt.step();
    const result = stmt.getAsObject();
    stmt.free();
    return result.count;
  }

  /**
   * Get all conversations (for export/backup)
   */
  getAllConversations(limit = 1000, offset = 0) {
    const stmt = this.db.prepare(`
      SELECT * FROM conversations
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);
    stmt.bind([limit, offset]);

    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  /**
   * Store a memory/fact
   */
  setMemory(userId, platform, key, value) {
    const stmt = this.db.prepare(`
      INSERT INTO memories (user_id, platform, key, value)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, platform, key) DO UPDATE SET
        value = excluded.value,
        updated_at = datetime('now')
    `);
    stmt.run([userId, platform, key, JSON.stringify(value)]);
    stmt.free();
  }

  /**
   * Get a memory/fact
   */
  getMemory(userId, platform, key) {
    const stmt = this.db.prepare(`
      SELECT value FROM memories
      WHERE user_id = ? AND platform = ? AND key = ?
    `);
    stmt.bind([userId, platform, key]);

    if (stmt.step()) {
      const result = stmt.getAsObject();
      stmt.free();
      return JSON.parse(result.value);
    }
    stmt.free();
    return null;
  }

  /**
   * Get all memories for a user
   */
  getAllMemories(userId, platform) {
    const stmt = this.db.prepare(`
      SELECT key, value, updated_at FROM memories
      WHERE user_id = ? AND platform = ?
      ORDER BY updated_at DESC
    `);
    stmt.bind([userId, platform]);

    const rows = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      rows.push({
        key: row.key,
        value: JSON.parse(row.value),
        updatedAt: row.updated_at,
      });
    }
    stmt.free();
    return rows;
  }

  /**
   * Add a reminder
   */
  addReminder(userId, platform, message, remindAt, channelId = null) {
    const stmt = this.db.prepare(`
      INSERT INTO reminders (user_id, platform, channel_id, message, remind_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run([userId, platform, channelId, message, remindAt]);
    stmt.free();
  }

  /**
   * Get due reminders
   */
  getDueReminders() {
    const stmt = this.db.prepare(`
      SELECT * FROM reminders
      WHERE remind_at <= datetime('now') AND completed = 0
    `);

    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  /**
   * Mark reminder as completed
   */
  completeReminder(id) {
    const stmt = this.db.prepare(`UPDATE reminders SET completed = 1 WHERE id = ?`);
    stmt.run([id]);
    stmt.free();
  }

  /**
   * Get pending reminders for a user
   */
  getUserReminders(userId, platform) {
    const stmt = this.db.prepare(`
      SELECT * FROM reminders 
      WHERE user_id = ? AND platform = ? AND completed = 0
      ORDER BY remind_at ASC
    `);
    stmt.bind([userId, platform]);

    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  /**
   * Store plugin data
   */
  setPluginData(pluginName, key, value) {
    const stmt = this.db.prepare(`
      INSERT INTO plugin_data (plugin_name, key, value)
      VALUES (?, ?, ?)
      ON CONFLICT(plugin_name, key) DO UPDATE SET
        value = excluded.value,
        updated_at = datetime('now')
    `);
    stmt.run([pluginName, key, JSON.stringify(value)]);
    stmt.free();
  }

  /**
   * Get plugin data
   */
  getPluginData(pluginName, key) {
    const stmt = this.db.prepare(`
      SELECT value FROM plugin_data
      WHERE plugin_name = ? AND key = ?
    `);
    stmt.bind([pluginName, key]);

    if (stmt.step()) {
      const result = stmt.getAsObject();
      stmt.free();
      return JSON.parse(result.value);
    }
    stmt.free();
    return null;
  }

  /**
   * Get database stats
   */
  getStats() {
    const stats = {};

    // Count conversations
    let stmt = this.db.prepare(`SELECT COUNT(*) as count FROM conversations`);
    stmt.step();
    stats.totalMessages = stmt.getAsObject().count;
    stmt.free();

    // Count unique users
    stmt = this.db.prepare(`SELECT COUNT(DISTINCT user_id || platform) as count FROM conversations`);
    stmt.step();
    stats.uniqueUsers = stmt.getAsObject().count;
    stmt.free();

    // Count memories
    stmt = this.db.prepare(`SELECT COUNT(*) as count FROM memories`);
    stmt.step();
    stats.totalMemories = stmt.getAsObject().count;
    stmt.free();

    // Count pending reminders
    stmt = this.db.prepare(`SELECT COUNT(*) as count FROM reminders WHERE completed = 0`);
    stmt.step();
    stats.pendingReminders = stmt.getAsObject().count;
    stmt.free();

    // Database file size
    if (fs.existsSync(this.dbPath)) {
      const stat = fs.statSync(this.dbPath);
      stats.dbSizeBytes = stat.size;
    }

    return stats;
  }

  /**
   * Run raw SQL query (for advanced use)
   */
  query(sql, params = []) {
    const stmt = this.db.prepare(sql);
    if (params.length > 0) {
      stmt.bind(params);
    }

    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  async close() {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
    }
    if (this.db) {
      this.save(); // Final save
      this.db.close();
    }
  }
}

module.exports = DatabaseManager;
