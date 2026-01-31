# 🤖 FreppeBot

A powerful, self-hosted AI assistant with an **easy plugin system**. Similar to Clawdbot/OpenClaw but simpler to set up and extend.

## ✨ Features

- 🧠 **Multiple AI Providers** - OpenRouter, OpenAI, Anthropic, Kimi
- 💬 **Multi-Platform** - Discord & Telegram
- 🔌 **Easy Plugin System** - Create plugins in minutes
- 💾 **Persistent Memory** - Remembers conversations & user info
- 🎭 **Customizable Personality** - Choose how your bot responds
- 🐳 **Easy VPS Deployment** - One-command Docker deploy
- 🛡️ **Security Features** - Rate limiting, command cooldowns, input validation
- 📊 **Health Monitoring** - Track bot performance and system resources
- 🖥️ **TUI Dashboard** - Real-time terminal monitoring interface
- 💾 **Automatic Backups** - Database backups every 6 hours with manual controls
- ⚡ **Error Handling** - Robust error handling with helpful user messages

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run interactive setup
npm run setup

# 3. Start the bot
npm start

# Or start with TUI monitor (recommended)
npm run monitor
```

The setup wizard will guide you through configuring:
- Bot name & personality
- AI provider (OpenRouter recommended)
- Discord and/or Telegram
- Optional integrations (Twitter, Spotify, Email)

## 📦 Built-in Commands

### Core Commands
| Command | Description | Admin Only? |
|---------|-------------|-------------|
| `!help` | Show available commands | ❌ |
| `!plugins` | List loaded plugins | ❌ |
| `!health` / `!status` | Show bot health and statistics | ❌ |
| `!backup` | Create/manage database backups | ✅ |
| `!backup list` | List all backups | ✅ |
| `!backup delete <file>` | Delete a backup | ✅ |

### Built-in Core Plugins (Always Loaded)

These plugins are part of FreppeBot core and cannot be disabled:

| Plugin | Commands | AI Tools | Description |
|--------|----------|----------|-------------|
| **memory** | `!remember`, `!recall` | `remember`, `recall` | Store and retrieve user memories |
| **reminder** | `!remind`, `!reminders` | `setReminder`, `listReminders` | Set and manage reminders |
| **system** | `!status`, `!sysinfo` | `getSystemInfo` | Bot & system information |
| **files** | `!ls`, `!cat` | `readFile`, `writeFile`, `listDirectory` | File operations (admin only) |
| **shell** | `!shell` | `executeCommand` | Execute shell commands (admin only) |
| **os** | `!run`, `!read`, `!write` | `readFile`, `writeFile`, `runCommand` | OS-level operations (admin only) |
| **web** | `!fetch` | `fetchUrl`, `webSearch` | Fetch web content and search |

### Community Plugins (Optional)

These plugins are included but can be disabled. Located in `plugins/community/`:

| Plugin | Commands | AI Tools | API Key Needed? |
|--------|----------|----------|-----------------|
| 🌤️ **weather** | `!weather <location>` | `getWeather` | ❌ Free (Open-Meteo) |
| 💰 **crypto** | `!price <symbol>`, `!trending` | `getCryptoPrice`, `getTrending` | ❌ Free |
| 🎵 **spotify** | `!song <query>`, `!artist <name>` | `searchMusic` | ✅ Spotify API |
| 📅 **calendar** | `!event`, `!agenda` | `addEvent`, `getEvents` | ❌ Local storage |
| 🔗 **urlshortener** | `!shorten <url>` | `shortenUrl` | ❌ Free |
| 📧 **email** | `!email to@x.com Subject \| Body` | `sendEmail` | ✅ SMTP |
| 🐦 **twitter** | `!tweet`, `!trends` | `postTweet`, `getTrends` | ✅ Twitter API |
| 🎨 **imagegen** | `!imagine <prompt>` | `generateImage` | ✅ OpenAI API |
| 📝 **notes** | `!note`, `!notes` | `saveNote`, `getNotes` | ❌ Local storage |
| 🔐 **password** | `!password [length]` | `generatePassword` | ❌ Local |
| 📱 **qrcode** | `!qr <text>` | `generateQRCode` | ❌ Free API |
| 🌐 **translate** | `!translate <text> to <lang>` | `translateText` | ❌ Free API |
| 🔍 **brave** | `!search <query>` | `webSearch` | ✅ Brave API |
| 🐙 **github** | `!github <query>`, `!github-init`, `!github-commit`, `!github-push` | `searchGitHub`, `createFolder`, `createFile`, `initializeGitRepository`, `gitCommit`, `gitPush`, `createGitHubRepository` | ✅ GitHub Token (for repo creation) |
| 📰 **news** | `!news [topic]` | `getNews` | ✅ NewsAPI |
| 🎬 **reddit** | `!reddit <subreddit>` | `searchReddit` | ❌ Free |
| 📈 **stocks** | `!stock <symbol>` | `getStockPrice` | ❌ Free (Yahoo Finance) |

## 🔌 Creating Plugins

Plugins are super easy to create! Drop a `.js` file in `plugins/community/`:

```javascript
const { Plugin } = require('../../src/plugins/sdk');

module.exports = new Plugin({
  name: 'my-plugin',
  description: 'Does cool stuff',
  
  commands: {
    hello: {
      description: 'Say hello',
      handler: async (ctx, args) => {
        return `Hello, ${ctx.message.userId}!`;
      },
    },
  },
  
  tools: {
    greet: {
      description: 'AI can use this to greet someone',
      parameters: {
        name: { type: 'string', description: 'Name to greet' },
      },
      execute: async (params) => {
        return { message: `Hello, ${params.name}!` };
      },
    },
  },
});
```

Plugins auto-load when you add them (hot reload enabled by default).

## 📥 Plugin Manager

FreppeBot includes a plugin manager (similar to npm) for downloading plugins from URLs:

### Installation

After installing FreppeBot, you can use the plugin manager via npm scripts:

```bash
npm run plugin <command>
```

Or install globally to use the `freppe` command:

```bash
npm install -g .
freppe <command>
```

### Commands

#### Download a Plugin

Download and install a plugin from a URL:

```bash
# From raw GitHub file
npm run plugin download https://raw.githubusercontent.com/user/repo/main/plugin.js

# From GitHub blob URL (auto-converted to raw)
npm run plugin download https://github.com/user/repo/blob/main/plugin.js

# From any direct URL
npm run plugin download https://example.com/plugin.js

# Force overwrite existing plugin
npm run plugin download <url> --force
```

#### List Installed Plugins

View all installed plugins with their details:

```bash
npm run plugin list
```

#### Remove a Plugin

Uninstall a plugin:

```bash
npm run plugin remove <plugin-name>
```

#### Update a Plugin

Update a plugin to the latest version from its original URL:

```bash
npm run plugin update <plugin-name>
```

### Features

- ✅ **Automatic URL normalization** - Converts GitHub URLs to raw content
- ✅ **Plugin validation** - Validates plugins before installation
- ✅ **Metadata tracking** - Tracks plugin source URLs for updates
- ✅ **Safe installation** - Prevents overwriting without `--force`
- ✅ **Error handling** - Clear error messages for common issues

### Example Workflow

```bash
# Download a plugin
npm run plugin download https://raw.githubusercontent.com/user/awesome-plugin/main/index.js

# List installed plugins
npm run plugin list

# Update the plugin
npm run plugin update awesome-plugin

# Remove if needed
npm run plugin remove awesome-plugin
```

## 🐳 Docker Deployment

```bash
# Build and run
docker compose up -d

# View logs
docker compose logs -f
```

## 📁 Project Structure

```
FreppeBot/
├── src/
│   ├── core/          # Bot engine (bot, router, context)
│   ├── ai/            # AI providers (OpenRouter, OpenAI, etc.)
│   ├── adapters/      # Discord, Telegram adapters
│   ├── plugins/       # Plugin system (loader, registry, SDK)
│   ├── storage/       # Database & memory storage
│   ├── utils/         # Utilities (logger, config, health, backup, rate limit)
│   └── cli/           # Setup wizard
├── plugins/
│   ├── core/          # Built-in plugins
│   └── community/     # Your plugins here!
├── data/
│   ├── freppebot.db   # Main database
│   ├── backups/       # Automatic backups (last 10 kept)
│   └── freppebot.log  # Application logs
└── config.json        # Your config
```

## ⚙️ Configuration

All config is in `config.json` (created by `npm run setup`):

```json
{
  "bot": {
    "name": "FreppeBot",
    "commandPrefix": "!",
    "logLevel": "info",
    "systemPrompt": "You are a helpful assistant...",
    "personality": {
      "style": "concise",
      "tone": "friendly",
      "useEmojis": true
    }
  },
  "ai": {
    "defaultProvider": "openrouter",
    "defaultModel": "anthropic/claude-sonnet-4.5",
    "openrouterKey": "...",
    "openaiKey": "...",
    "anthropicKey": "...",
    "kimiKey": "..."
  },
  "platforms": {
    "discord": {
      "enabled": true,
      "token": "...",
      "allowedUsers": [],
      "adminUsers": []
    },
    "telegram": {
      "enabled": false,
      "token": "",
      "allowedUsers": [],
      "adminUsers": []
    }
  },
  "plugins": {
    "hotReload": true,
    "disabled": []
  }
}
```

### Key Configuration Options

- **`bot.systemPrompt`**: Customize how the AI responds
- **`bot.logLevel`**: `error`, `warn`, `info`, `debug`
- **`platforms.*.allowedUsers`**: Whitelist of user IDs (empty = allow all)
- **`platforms.*.adminUsers`**: User IDs with admin privileges
- **`plugins.hotReload`**: Auto-reload plugins when files change
- **`plugins.disabled`**: Array of plugin names to disable

## 🔐 Security

- **API Keys**: Stored in `config.json` (not committed to git)
- **Access Control**: Admin-only commands for dangerous operations
- **User Whitelist**: Allowed users list for private bots
- **Rate Limiting**: 10 requests per minute per user (admins exempt)
- **Command Cooldowns**: Prevents command spam (2s default, configurable per command)
- **Input Validation**: Sanitizes and validates all user input
- **Error Handling**: Secure error messages that don't expose internal details

## 🏥 Health Monitoring

The bot includes built-in health monitoring that tracks:

- **Performance Metrics**: Messages processed, commands executed, errors
- **System Resources**: CPU, memory usage, disk space
- **Database Stats**: Message count, user count, memory entries
- **Adapter Status**: Connection status for Discord/Telegram
- **Plugin Info**: Number of loaded plugins

Use `!health` or `!status` to view a comprehensive health report.

## 🖥️ TUI Monitor Dashboard

FreppeBot includes a beautiful terminal UI (TUI) for real-time monitoring:

```bash
npm run monitor
```

The TUI dashboard displays:

- **System Stats**: CPU, memory, platform, Node version, uptime
- **Bot Statistics**: Status, uptime, messages processed, commands executed, errors, plugins
- **Adapters**: Connection status for Discord and Telegram
- **Database**: Message count, users, memories, reminders, database size
- **Plugins**: List of loaded plugins with command and tool counts
- **Memory Chart**: Real-time memory usage graph
- **Recent Activity**: Live log viewer with color-coded messages

### Features

- **Real-time Updates**: Refreshes every second
- **Color-coded Logs**: Errors (red), warnings (yellow), info (green), debug (cyan)
- **Interactive**: Press `q` or `ESC` to quit gracefully
- **Full-screen**: Uses entire terminal for maximum visibility

The monitor automatically starts the bot and displays all metrics in a single, easy-to-read interface.

## 💾 Database Backups

FreppeBot automatically creates database backups:

- **Automatic**: Backups every 6 hours
- **Manual**: Use `!backup` to create a backup on demand
- **Management**: 
  - `!backup list` - View all backups
  - `!backup delete <filename>` - Delete a backup
- **Retention**: Keeps the last 10 backups automatically

Backups are stored in `data/backups/` and include timestamps in the filename.

## 🛡️ Security Features

### Rate Limiting
- **10 requests per minute** per user (admins exempt)
- Prevents abuse and API cost spikes
- Clear error messages when limit is reached

### Command Cooldowns
- **2 seconds** default cooldown between commands
- **5 seconds** for shell commands
- **3 seconds** for reminder commands
- Prevents command spam and accidental duplicates

### Input Validation
- Message length limits (10,000 characters max)
- Sanitization of dangerous characters
- Type checking for tool arguments
- Parameter validation against schemas

### Error Handling
- User-friendly error messages
- Detailed error logging for debugging
- Graceful degradation
- No exposure of internal system details

## 📊 Monitoring & Maintenance

### Health Check
```bash
# In Discord/Telegram
!health
```

Shows:
- Bot uptime and status
- Adapter connection status
- Message/command statistics
- Database size and stats
- System resource usage

### Backup Management
```bash
# Create backup
!backup

# List backups
!backup list

# Delete backup (admin only)
!backup delete freppebot-backup-2024-01-01T12-00-00.db
```

## 🐛 Troubleshooting

### Bot not responding
1. Check `!health` for adapter status
2. Check logs in `data/freppebot.log`
3. Verify API keys in `config.json`
4. Ensure bot has proper permissions (Discord) or is started (Telegram)

### Rate limit errors
- Wait for the cooldown period
- Admins are exempt from rate limits
- Adjust limits in `src/utils/ratelimit.js` if needed

### Database issues
- Check `data/freppebot.db` exists
- Restore from backup: `!backup list` then copy backup to `data/`
- Check disk space availability

## 📝 License

MIT
