/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     DATABASE BACKUP                           ║
 * ║                                                                 ║
 * ║   Creates backups of the database for safety                   ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const fs = require('fs');
const path = require('path');

class BackupManager {
    constructor(database, dbPath) {
        this.database = database;
        this.dbPath = dbPath;
        this.backupDir = path.join(process.cwd(), 'data', 'backups');
        this.maxBackups = 10; // Keep last 10 backups
    }

    /**
     * Ensure backup directory exists
     */
    ensureBackupDir() {
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }
    }

    /**
     * Create a backup of the database
     * @returns {Object} { success: boolean, path: string, error: string }
     */
    async createBackup() {
        try {
            this.ensureBackupDir();

            // Generate backup filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFilename = `freppebot-backup-${timestamp}.db`;
            const backupPath = path.join(this.backupDir, backupFilename);

            // Save current database state
            if (this.database && this.database.db) {
                this.database.save();
            }

            // Copy database file
            if (fs.existsSync(this.dbPath)) {
                fs.copyFileSync(this.dbPath, backupPath);
                
                // Get file stats
                const stats = fs.statSync(backupPath);
                const sizeMB = (stats.size / 1024 / 1024).toFixed(2);

                // Clean up old backups
                this.cleanupOldBackups();

                return {
                    success: true,
                    path: backupPath,
                    filename: backupFilename,
                    size: stats.size,
                    sizeMB: parseFloat(sizeMB),
                    timestamp: new Date().toISOString(),
                };
            } else {
                return {
                    success: false,
                    error: 'Database file not found',
                };
            }
        } catch (error) {
            return {
                success: false,
                error: error.message || 'Unknown error',
            };
        }
    }

    /**
     * List all backups
     * @returns {Array} List of backup files with metadata
     */
    listBackups() {
        this.ensureBackupDir();

        if (!fs.existsSync(this.backupDir)) {
            return [];
        }

        const files = fs.readdirSync(this.backupDir)
            .filter(file => file.endsWith('.db') && file.startsWith('freppebot-backup-'))
            .map(file => {
                const filePath = path.join(this.backupDir, file);
                const stats = fs.statSync(filePath);
                return {
                    filename: file,
                    path: filePath,
                    size: stats.size,
                    sizeMB: (stats.size / 1024 / 1024).toFixed(2),
                    created: stats.birthtime,
                    modified: stats.mtime,
                };
            })
            .sort((a, b) => b.created - a.created); // Newest first

        return files;
    }

    /**
     * Restore from a backup
     * @param {string} backupFilename - Name of backup file to restore
     * @returns {Object} { success: boolean, error: string }
     */
    async restoreBackup(backupFilename) {
        try {
            const backupPath = path.join(this.backupDir, backupFilename);

            if (!fs.existsSync(backupPath)) {
                return {
                    success: false,
                    error: 'Backup file not found',
                };
            }

            // Create a backup of current database before restoring
            const currentBackup = await this.createBackup();
            if (!currentBackup.success) {
                return {
                    success: false,
                    error: 'Failed to create backup of current database before restore',
                };
            }

            // Close current database connection
            if (this.database && this.database.db) {
                this.database.save();
                this.database.db.close();
            }

            // Copy backup to database location
            fs.copyFileSync(backupPath, this.dbPath);

            return {
                success: true,
                message: 'Backup restored successfully. Please restart the bot.',
                currentBackup: currentBackup.filename,
            };
        } catch (error) {
            return {
                success: false,
                error: error.message || 'Unknown error',
            };
        }
    }

    /**
     * Delete a backup
     * @param {string} backupFilename - Name of backup file to delete
     * @returns {Object} { success: boolean, error: string }
     */
    deleteBackup(backupFilename) {
        try {
            const backupPath = path.join(this.backupDir, backupFilename);

            if (!fs.existsSync(backupPath)) {
                return {
                    success: false,
                    error: 'Backup file not found',
                };
            }

            fs.unlinkSync(backupPath);

            return {
                success: true,
                message: 'Backup deleted successfully',
            };
        } catch (error) {
            return {
                success: false,
                error: error.message || 'Unknown error',
            };
        }
    }

    /**
     * Clean up old backups, keeping only the most recent N
     */
    cleanupOldBackups() {
        const backups = this.listBackups();

        if (backups.length > this.maxBackups) {
            // Delete oldest backups
            const toDelete = backups.slice(this.maxBackups);
            for (const backup of toDelete) {
                try {
                    fs.unlinkSync(backup.path);
                } catch (error) {
                    // Ignore errors when deleting old backups
                }
            }
        }
    }

    /**
     * Get backup directory size
     */
    getBackupDirSize() {
        this.ensureBackupDir();

        if (!fs.existsSync(this.backupDir)) {
            return { totalMB: 0, fileCount: 0 };
        }

        const backups = this.listBackups();
        const totalBytes = backups.reduce((sum, backup) => sum + backup.size, 0);
        const totalMB = (totalBytes / 1024 / 1024).toFixed(2);

        return {
            totalMB: parseFloat(totalMB),
            fileCount: backups.length,
        };
    }
}

module.exports = BackupManager;

