/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     TUI MONITOR                                 ║
 * ║                                                                 ║
 * ║   Real-time terminal dashboard for monitoring FreppeBot        ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const blessed = require('blessed');
const contrib = require('blessed-contrib');
const fs = require('fs');
const path = require('path');
const { loadConfig } = require('../utils/config');
const FreppeBot = require('../core/bot');
const os = require('os');

class TUIMonitor {
    constructor() {
        this.screen = null;
        this.grid = null;
        this.bot = null;
        this.updateInterval = null;
        this.logLines = [];
        this.maxLogLines = 50;
    }

    async initialize() {
        try {
            // Create screen FIRST so we can show errors
            this.screen = blessed.screen({
                smartCSR: true,
                title: 'FreppeBot Monitor',
                fullUnicode: true,
            });

            // Show loading message
            const loadingBox = blessed.box({
                top: 'center',
                left: 'center',
                width: '50%',
                height: 'shrink',
                content: '{bold}Initializing FreppeBot...{/bold}\n\nPlease wait...',
                tags: true,
                border: {
                    type: 'line',
                },
                style: {
                    border: {
                        fg: 'cyan',
                    },
                },
            });
            this.screen.append(loadingBox);
            this.screen.render();

            // Load config and initialize bot
            const config = loadConfig();
            this.bot = new FreppeBot(config);
            await this.bot.initialize();
            await this.bot.start();

            // Remove loading box
            loadingBox.detach();

            // Create grid
            this.grid = new contrib.grid({
                rows: 12,
                cols: 12,
                screen: this.screen,
            });

            // Create widgets
            this.createWidgets();

            // Handle keys
            this.screen.key(['escape', 'q', 'C-c'], () => {
                return this.shutdown();
            });

            // Start update loop
            this.startUpdates();

            // Render
            this.screen.render();
        } catch (error) {
            // Show error on screen if it exists
            if (this.screen) {
                const errorBox = blessed.box({
                    top: 'center',
                    left: 'center',
                    width: '70%',
                    height: 'shrink',
                    content: `{bold}{red-fg}Error Initializing Monitor{/red-fg}{/bold}\n\n${error.message}\n\nPress {bold}q{/bold} to exit`,
                    tags: true,
                    border: {
                        type: 'line',
                    },
                    style: {
                        border: {
                            fg: 'red',
                        },
                    },
                });
                this.screen.append(errorBox);
                this.screen.key(['escape', 'q', 'C-c'], () => {
                    if (this.screen) this.screen.destroy();
                    process.exit(1);
                });
                this.screen.render();
            } else {
                console.error('Failed to initialize monitor:', error);
                process.exit(1);
            }
        }
    }

    createWidgets() {
        // Header
        const header = this.grid.set(0, 0, 1, 12, blessed.box, {
            content: '{bold}FreppeBot Monitor{/bold} | Press {bold}q{/bold} or {bold}ESC{/bold} to quit',
            tags: true,
            style: {
                fg: 'white',
                bg: 'blue',
            },
        });

        // System Stats (Top Left)
        this.systemBox = this.grid.set(1, 0, 3, 4, blessed.box, {
            label: ' System ',
            tags: true,
            border: {
                type: 'line',
            },
            style: {
                border: {
                    fg: 'cyan',
                },
            },
        });

        // Bot Stats (Top Middle)
        this.statsBox = this.grid.set(1, 4, 3, 4, blessed.box, {
            label: ' Bot Statistics ',
            tags: true,
            border: {
                type: 'line',
            },
            style: {
                border: {
                    fg: 'green',
                },
            },
        });

        // Adapters (Top Right)
        this.adaptersBox = this.grid.set(1, 8, 3, 4, blessed.box, {
            label: ' Adapters ',
            tags: true,
            border: {
                type: 'line',
            },
            style: {
                border: {
                    fg: 'yellow',
                },
            },
        });

        // Database Stats (Middle Left)
        this.databaseBox = this.grid.set(4, 0, 3, 4, blessed.box, {
            label: ' Database ',
            tags: true,
            border: {
                type: 'line',
            },
            style: {
                border: {
                    fg: 'magenta',
                },
            },
        });

        // Plugins (Middle Middle)
        this.pluginsBox = this.grid.set(4, 4, 3, 4, blessed.box, {
            label: ' Plugins ',
            tags: true,
            border: {
                type: 'line',
            },
            style: {
                border: {
                    fg: 'cyan',
                },
            },
            scrollable: true,
            alwaysScroll: true,
            scrollbar: {
                ch: ' ',
                inverse: true,
            },
        });

        // Memory Chart (Middle Right)
        this.memoryChart = this.grid.set(4, 8, 3, 4, contrib.line, {
            label: ' Memory Usage ',
            showLegend: true,
            legend: { width: 12 },
            wholeNumbersOnly: false,
            style: {
                line: 'yellow',
                text: 'green',
                baseline: 'black',
            },
        });

        // Logs (Bottom)
        this.logBox = this.grid.set(7, 0, 5, 12, blessed.log, {
            label: ' Recent Activity ',
            tags: true,
            border: {
                type: 'line',
            },
            style: {
                border: {
                    fg: 'white',
                },
            },
            scrollable: true,
            alwaysScroll: true,
            scrollbar: {
                ch: ' ',
                inverse: true,
            },
        });

        // Initialize memory chart data
        this.memoryData = {
            titles: ['Used', 'Free'],
            x: [],
            y: [],
        };
    }

    startUpdates() {
        // Update every second
        this.updateInterval = setInterval(() => {
            this.update();
        }, 1000);

        // Initial update
        this.update();
    }

    update() {
        if (!this.screen || !this.bot || !this.bot.healthMonitor) {
            return;
        }

        const health = this.bot.healthMonitor.getHealth();

        // Update System Stats
        const systemContent = `{bold}Platform:{/bold} ${health.system.platform} ${health.system.arch}
{bold}Node:{/bold} ${health.system.nodeVersion}
{bold}CPU:{/bold} ${health.system.cpu.cores} cores
{bold}Uptime:{/bold} ${health.system.uptime}
{bold}Memory:{/bold} ${health.system.memory.used}MB / ${health.system.memory.total}MB
{bold}Usage:{/bold} ${health.system.memory.usagePercent}%`;
        this.systemBox.setContent(systemContent);

        // Update Bot Stats
        const statsContent = `{bold}Status:{/bold} {green-fg}${health.status.toUpperCase()}{/green-fg}
{bold}Bot Uptime:{/bold} ${health.uptime}
{bold}Messages:{/bold} ${health.stats.messagesProcessed}
{bold}Commands:{/bold} ${health.stats.commandsExecuted}
{bold}Errors:{/bold} ${health.stats.errors > 0 ? `{red-fg}${health.stats.errors}{/red-fg}` : `{green-fg}${health.stats.errors}{/green-fg}`}
{bold}Plugins:{/bold} ${health.stats.pluginCount}`;
        this.statsBox.setContent(statsContent);

        // Update Adapters
        let adaptersContent = '';
        for (const adapter of health.adapters) {
            const statusColor = adapter.status === 'connected' ? 'green-fg' : 'red-fg';
            const statusIcon = adapter.status === 'connected' ? '●' : '○';
            adaptersContent += `{${statusColor}}${statusIcon}{/} {bold}${adapter.name}{/bold}\n`;
            adaptersContent += `   Platform: ${adapter.platform}\n`;
            adaptersContent += `   Status: {${statusColor}}${adapter.status}{/${statusColor}}\n\n`;
        }
        this.adaptersBox.setContent(adaptersContent || 'No adapters');

        // Update Database Stats
        if (health.database) {
            const dbSizeMB = health.database.dbSizeBytes
                ? (health.database.dbSizeBytes / 1024 / 1024).toFixed(2)
                : 'N/A';
            const dbContent = `{bold}Messages:{/bold} ${health.database.totalMessages}
{bold}Users:{/bold} ${health.database.uniqueUsers}
{bold}Memories:{/bold} ${health.database.totalMemories}
{bold}Reminders:{/bold} ${health.database.pendingReminders}
{bold}Size:{/bold} ${dbSizeMB} MB`;
            this.databaseBox.setContent(dbContent);
        } else {
            this.databaseBox.setContent('Database not available');
        }

        // Update Plugins
        const plugins = this.bot.pluginRegistry?.getAllPlugins() || [];
        let pluginsContent = '';
        if (plugins.length === 0) {
            pluginsContent = 'No plugins loaded';
        } else {
            for (const plugin of plugins.slice(0, 10)) {
                const toolCount = plugin.tools ? Object.keys(plugin.tools).length : 0;
                const cmdCount = plugin.commands ? Object.keys(plugin.commands).length : 0;
                pluginsContent += `{bold}${plugin.name}{/bold} v${plugin.version}\n`;
                pluginsContent += `  ${cmdCount} commands, ${toolCount} tools\n\n`;
            }
            if (plugins.length > 10) {
                pluginsContent += `... and ${plugins.length - 10} more`;
            }
        }
        this.pluginsBox.setContent(pluginsContent);

        // Update Memory Chart
        const now = new Date().toLocaleTimeString();
        this.memoryData.x.push(now);
        if (this.memoryData.x.length > 20) {
            this.memoryData.x.shift();
        }

        const usedPercent = health.system.memory.usagePercent;
        const freePercent = 100 - usedPercent;

        if (!this.memoryData.y.length) {
            this.memoryData.y = [[], []];
        }

        this.memoryData.y[0].push(usedPercent);
        this.memoryData.y[1].push(freePercent);

        if (this.memoryData.y[0].length > 20) {
            this.memoryData.y[0].shift();
            this.memoryData.y[1].shift();
        }

        this.memoryChart.setData(this.memoryData.y);

        // Update Logs (read from log file)
        this.updateLogs();

        // Render
        this.screen.render();
    }

    updateLogs() {
        const logPath = path.join(process.cwd(), 'data', 'freppebot.log');
        if (!fs.existsSync(logPath)) {
            return;
        }

        try {
            const logContent = fs.readFileSync(logPath, 'utf-8');
            const lines = logContent.split('\n').filter(l => l.trim());
            const recentLines = lines.slice(-this.maxLogLines);

            // Only add new lines
            const newLines = recentLines.filter(line => {
                return !this.logLines.includes(line);
            });

            for (const line of newLines) {
                // Parse log line and format
                let formattedLine = line;
                try {
                    const parsed = JSON.parse(line);
                    const level = parsed.level || 'info';
                    const message = parsed.message || '';
                    const timestamp = parsed.timestamp || '';

                    // Color code by level
                    let color = 'white';
                    if (level.includes('error')) color = 'red';
                    else if (level.includes('warn')) color = 'yellow';
                    else if (level.includes('info')) color = 'green';
                    else if (level.includes('debug')) color = 'cyan';

                    formattedLine = `{${color}-fg}[${timestamp}] ${level.toUpperCase()}: ${message}{/${color}-fg}`;
                } catch (e) {
                    // Not JSON, use as-is
                }

                this.logBox.log(formattedLine);
                this.logLines.push(line);

                // Keep only recent lines
                if (this.logLines.length > this.maxLogLines) {
                    this.logLines.shift();
                }
            }
        } catch (error) {
            // Log file might be locked or not readable
        }
    }

    async shutdown() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        if (this.bot) {
            try {
                await this.bot.stop();
            } catch (error) {
                console.error('Error stopping bot:', error);
            }
        }

        if (this.screen) {
            try {
                this.screen.destroy();
            } catch (error) {
                // Screen might already be destroyed
            }
        }
        
        process.exit(0);
    }
}

// Main
async function main() {
    // Check if we're in a TTY
    if (!process.stdout.isTTY) {
        console.error('Error: TUI monitor requires a terminal (TTY)');
        console.error('Please run this command in a terminal, not through a pipe or redirect');
        process.exit(1);
    }

    const monitor = new TUIMonitor();

    // Handle process signals - but only after screen is created
    const shutdownHandler = () => {
        monitor.shutdown().catch(err => {
            console.error('Shutdown error:', err);
            process.exit(1);
        });
    };

    try {
        await monitor.initialize();
        // Only register signal handlers after successful initialization
        process.on('SIGINT', shutdownHandler);
        process.on('SIGTERM', shutdownHandler);
    } catch (error) {
        // Error handling is done in initialize()
        // If we get here, screen wasn't created, so just exit
        console.error('Failed to start monitor:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = TUIMonitor;

