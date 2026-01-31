# FreppeBot Data

This directory contains persistent data for FreppeBot:

- `freppebot.db` - SQLite database with conversations, memories, reminders
- `freppebot.log` - Log files
- `backups/` - Automatic database backups (created every 6 hours, last 10 kept)

**Note:** This directory is automatically created when FreppeBot starts.
The database is also persisted when using Docker via volume mounts.

## Backups

FreppeBot automatically creates backups of the database:
- **Automatic**: Every 6 hours
- **Manual**: Use `!backup` command in Discord/Telegram
- **Location**: `data/backups/`
- **Format**: `freppebot-backup-YYYY-MM-DDTHH-MM-SS.db`
- **Retention**: Last 10 backups are kept automatically

To restore a backup, copy the backup file to `data/freppebot.db` and restart the bot.
