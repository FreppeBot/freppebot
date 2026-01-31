# Changelog

All notable changes to FreppeBot will be documented in this file.

## [1.1.0] - 2024-01-XX

### Added

#### Security & Performance
- **Rate Limiting**: Added rate limiting system (10 requests/minute per user, admins exempt)
- **Command Cooldowns**: Prevents command spam with configurable cooldowns (2s default, 5s for shell, 3s for reminders)
- **Input Validation**: Comprehensive input sanitization and validation
  - Message length limits (10,000 characters)
  - Null byte removal
  - Type checking for tool arguments
  - Parameter validation against schemas

#### Monitoring & Maintenance
- **Health Monitoring**: New health monitoring system tracks:
  - Messages processed, commands executed, errors
  - System resources (CPU, memory)
  - Database statistics
  - Adapter connection status
  - Plugin count
- **Health Command**: New `!health` / `!status` command to view comprehensive health reports

#### Database Management
- **Automatic Backups**: Database backups created every 6 hours automatically
- **Backup Management**: New `!backup` command system:
  - `!backup` - Create manual backup
  - `!backup list` - List all backups
  - `!backup delete <filename>` - Delete a backup
- **Backup Retention**: Automatically keeps last 10 backups, cleans up older ones

#### Error Handling
- Improved error messages with better user context
- Detailed error logging for debugging (stack traces in debug mode)
- Graceful error handling that doesn't expose internal details
- Tool execution error handling with proper validation

### Fixed

- Fixed typo: "Prcessing" → "Processing" in reminder logs
- Fixed missing `systemPrompt` in config normalization (now properly passed to router)
- Improved adapter status checking in health monitor

### Improved

- Better error handling throughout the codebase
- More comprehensive input validation
- Enhanced security with rate limiting and cooldowns
- Better monitoring capabilities
- Improved documentation

## [1.0.0] - Initial Release

### Features
- Multiple AI providers (OpenRouter, OpenAI, Anthropic, Kimi)
- Discord and Telegram support
- Plugin system with hot reload
- Persistent memory and conversation history
- Reminder system
- File operations
- Shell command execution
- Web content fetching
- Community plugins (weather, crypto, Spotify, calendar, etc.)

