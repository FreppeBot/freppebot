/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     FREPPE-WRENCH PLUGIN                       ║
 * ║                                                                 ║
 * ║   AI-powered error resolution system using OpenRouter.         ║
 * ║   Analyzes errors and suggests/executes fixes automatically.   ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const { Plugin, helpers } = require('../../src/plugins/sdk');
const { exec } = require('child_process');
const { promisify } = require('util');
const fetch = require('node-fetch');
const logger = require('../../src/utils/logger');

const execAsync = promisify(exec);

// Error patterns and their categories
const ERROR_PATTERNS = {
    // Missing dependencies
    MISSING_DEPENDENCY: [
        /command not found[:\s]+(\w+)/i,
        /(\w+) is not recognized as an internal or external command/i,
        /cannot find module ['"]([^'"]+)['"]/i,
        /no such file or directory.*\/(\w+)/i,
        /(\w+): not found/i,
        /Error: Cannot find module '([^']+)'/i,
        /'(\w+)' is not installed/i,
        /(\w+) not installed/i,
    ],
    // Missing API keys
    MISSING_API_KEY: [
        /api[_\s]?key[:\s]*(not found|missing|invalid|required)/i,
        /authentication[:\s]*(failed|required|missing)/i,
        /unauthorized[:\s]*.*api/i,
        /invalid[_\s]?api[_\s]?key/i,
        /(\w+)[_\s]?key[:\s]*(not set|undefined|null|missing)/i,
        /missing[:\s]*(\w+)[_\s]?api[_\s]?key/i,
        /no[:\s]*(\w+)[_\s]?key[:\s]*(found|configured|set)/i,
    ],
    // Permission errors
    PERMISSION_ERROR: [
        /permission denied/i,
        /access denied/i,
        /EACCES/i,
        /operation not permitted/i,
    ],
    // Network errors
    NETWORK_ERROR: [
        /ECONNREFUSED/i,
        /ETIMEDOUT/i,
        /network[:\s]*(error|unreachable)/i,
        /connection[:\s]*(refused|reset|timeout)/i,
        /getaddrinfo ENOTFOUND/i,
    ],
    // Rate limiting
    RATE_LIMIT: [
        /rate[_\s]?limit/i,
        /too many requests/i,
        /429/,
        /quota exceeded/i,
    ],
};

// Common dependency installation commands
const DEPENDENCY_INSTALLERS = {
    // System package managers
    'yt-dlp': {
        windows: 'winget install yt-dlp || pip install yt-dlp',
        linux: 'sudo apt-get install -y yt-dlp || pip install yt-dlp',
        darwin: 'brew install yt-dlp || pip install yt-dlp',
    },
    'ffmpeg': {
        windows: 'winget install ffmpeg',
        linux: 'sudo apt-get install -y ffmpeg',
        darwin: 'brew install ffmpeg',
    },
    'python': {
        windows: 'winget install Python.Python.3',
        linux: 'sudo apt-get install -y python3',
        darwin: 'brew install python3',
    },
    'pip': {
        windows: 'python -m ensurepip --upgrade',
        linux: 'sudo apt-get install -y python3-pip',
        darwin: 'python3 -m ensurepip --upgrade',
    },
    'node': {
        windows: 'winget install OpenJS.NodeJS',
        linux: 'curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs',
        darwin: 'brew install node',
    },
    'git': {
        windows: 'winget install Git.Git',
        linux: 'sudo apt-get install -y git',
        darwin: 'brew install git',
    },
    'curl': {
        windows: 'winget install cURL.cURL',
        linux: 'sudo apt-get install -y curl',
        darwin: 'brew install curl',
    },
    'wget': {
        windows: 'winget install GNU.Wget',
        linux: 'sudo apt-get install -y wget',
        darwin: 'brew install wget',
    },
};

// API key environment variable mappings
const API_KEY_MAPPINGS = {
    'openai': ['OPENAI_API_KEY', 'OPENAI_KEY'],
    'anthropic': ['ANTHROPIC_API_KEY', 'ANTHROPIC_KEY'],
    'openrouter': ['OPENROUTER_API_KEY', 'OPENROUTER_KEY'],
    'discord': ['DISCORD_TOKEN', 'DISCORD_BOT_TOKEN'],
    'telegram': ['TELEGRAM_TOKEN', 'TELEGRAM_BOT_TOKEN'],
    'twitter': ['TWITTER_API_KEY', 'TWITTER_BEARER_TOKEN'],
    'github': ['GITHUB_TOKEN', 'GITHUB_API_KEY'],
    'spotify': ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'],
    'brave': ['BRAVE_API_KEY'],
    'google': ['GOOGLE_API_KEY'],
};

class WrenchErrorHandler {
    constructor(config = {}) {
        this.openrouterKey = config.openrouterKey;
        this.baseUrl = 'https://openrouter.ai/api/v1';
        this.model = config.model || 'anthropic/claude-3.5-sonnet';
        this.pendingKeyRequests = new Map(); // userId -> { service, resolve, reject, timeout }
    }

    /**
     * Classify an error into a category
     */
    classifyError(error) {
        const errorStr = typeof error === 'string' ? error : error.message || String(error);
        
        for (const [category, patterns] of Object.entries(ERROR_PATTERNS)) {
            for (const pattern of patterns) {
                const match = errorStr.match(pattern);
                if (match) {
                    return {
                        category,
                        match: match[1] || match[0],
                        pattern: pattern.toString(),
                        originalError: errorStr,
                    };
                }
            }
        }

        return {
            category: 'UNKNOWN',
            match: null,
            pattern: null,
            originalError: errorStr,
        };
    }

    /**
     * Get the current platform
     */
    getPlatform() {
        const platform = process.platform;
        if (platform === 'win32') return 'windows';
        if (platform === 'darwin') return 'darwin';
        return 'linux';
    }

    /**
     * Get installation command for a dependency
     */
    getInstallCommand(dependency) {
        const platform = this.getPlatform();
        const normalizedDep = dependency.toLowerCase().replace(/[^a-z0-9-]/g, '');
        
        if (DEPENDENCY_INSTALLERS[normalizedDep]) {
            return DEPENDENCY_INSTALLERS[normalizedDep][platform];
        }

        // Fallback: try npm for node modules
        if (dependency.startsWith('@') || !dependency.includes('/')) {
            return `npm install -g ${dependency}`;
        }

        return null;
    }

    /**
     * Ask AI for error resolution advice
     */
    async askAIForHelp(error, context = {}) {
        if (!this.openrouterKey) {
            logger.warn('Wrench: No OpenRouter API key configured, cannot ask AI for help');
            return null;
        }

        const classification = this.classifyError(error);
        
        const systemPrompt = `You are an expert system administrator and developer troubleshooter.
Your job is to analyze errors and provide actionable solutions.

IMPORTANT: Respond ONLY with a valid JSON object. No markdown, no explanation, just JSON.

The JSON must have this structure:
{
    "diagnosis": "Brief explanation of what went wrong",
    "solution_type": "one of: shell_command, api_key_needed, manual_fix, retry, escalate",
    "solution": {
        "command": "shell command to run (if solution_type is shell_command)",
        "service": "name of service needing API key (if solution_type is api_key_needed)",
        "instructions": "human-readable instructions for the user",
        "auto_fix": true/false (whether this can be auto-fixed)
    },
    "confidence": 0.0-1.0 (how confident you are in this solution)
}`;

        const userPrompt = `Error to analyze:
${error}

Error classification: ${classification.category}
Matched pattern: ${classification.match || 'none'}

Context:
- Platform: ${this.getPlatform()}
- Working directory: ${process.cwd()}
${context.additionalInfo ? `- Additional info: ${context.additionalInfo}` : ''}

Provide a solution in JSON format.`;

        try {
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.openrouterKey}`,
                    'HTTP-Referer': 'https://github.com/freppebot',
                    'X-Title': 'FreppeBot-Wrench',
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    temperature: 0.3, // Lower temperature for more consistent responses
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error(`Wrench AI request failed: ${response.status} - ${errorText}`);
                return null;
            }

            const data = await response.json();
            const content = data.choices[0]?.message?.content;

            if (!content) {
                return null;
            }

            // Parse JSON response
            try {
                // Clean up the response (remove markdown code blocks if present)
                let cleanContent = content.trim();
                if (cleanContent.startsWith('```json')) {
                    cleanContent = cleanContent.slice(7);
                }
                if (cleanContent.startsWith('```')) {
                    cleanContent = cleanContent.slice(3);
                }
                if (cleanContent.endsWith('```')) {
                    cleanContent = cleanContent.slice(0, -3);
                }
                
                return JSON.parse(cleanContent.trim());
            } catch (parseError) {
                logger.warn(`Wrench: Failed to parse AI response as JSON: ${parseError.message}`);
                // Return a basic response
                return {
                    diagnosis: content,
                    solution_type: 'manual_fix',
                    solution: {
                        instructions: content,
                        auto_fix: false,
                    },
                    confidence: 0.5,
                };
            }
        } catch (err) {
            logger.error(`Wrench AI error: ${err.message}`);
            return null;
        }
    }

    /**
     * Execute a shell command to fix an issue
     */
    async executeShellFix(command, ctx) {
        if (!ctx.isAdmin) {
            return {
                success: false,
                error: 'Shell fixes require admin privileges',
                requiresAdmin: true,
            };
        }

        try {
            logger.info(`Wrench: Executing fix command: ${command}`);
            const { stdout, stderr } = await execAsync(command, {
                timeout: 120000, // 2 minute timeout for installations
                maxBuffer: 1024 * 1024 * 5, // 5MB buffer
            });

            return {
                success: true,
                stdout: stdout || '',
                stderr: stderr || '',
                command,
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                stdout: error.stdout || '',
                stderr: error.stderr || '',
                command,
            };
        }
    }

    /**
     * Request an API key from the user via DM
     */
    async requestAPIKey(service, ctx) {
        const userId = ctx.message.userId;
        const platform = ctx.message.platform;

        // Check if there's already a pending request
        if (this.pendingKeyRequests.has(userId)) {
            return {
                success: false,
                error: 'Already waiting for an API key from you',
                pending: true,
            };
        }

        // Get the expected environment variable names
        const envVars = API_KEY_MAPPINGS[service.toLowerCase()] || [`${service.toUpperCase()}_API_KEY`];

        return new Promise((resolve) => {
            // Set up timeout (5 minutes)
            const timeout = setTimeout(() => {
                this.pendingKeyRequests.delete(userId);
                resolve({
                    success: false,
                    error: 'API key request timed out',
                    timedOut: true,
                });
            }, 5 * 60 * 1000);

            // Store the pending request
            this.pendingKeyRequests.set(userId, {
                service,
                envVars,
                resolve,
                timeout,
                createdAt: Date.now(),
            });

            // The actual DM will be sent by the caller
            resolve({
                success: true,
                waitingForKey: true,
                service,
                envVars,
                message: `Please send your ${service} API key. It will be stored securely.`,
            });
        });
    }

    /**
     * Handle a received API key from user
     */
    handleReceivedAPIKey(userId, apiKey) {
        const pending = this.pendingKeyRequests.get(userId);
        if (!pending) {
            return {
                success: false,
                error: 'No pending API key request',
            };
        }

        // Clear timeout
        clearTimeout(pending.timeout);
        this.pendingKeyRequests.delete(userId);

        // Validate the key format (basic check)
        if (!apiKey || apiKey.length < 10) {
            return {
                success: false,
                error: 'Invalid API key format',
            };
        }

        return {
            success: true,
            service: pending.service,
            envVars: pending.envVars,
            apiKey: apiKey.trim(),
        };
    }

    /**
     * Check if user has a pending API key request
     */
    hasPendingKeyRequest(userId) {
        return this.pendingKeyRequests.has(userId);
    }

    /**
     * Main error resolution method
     */
    async resolveError(error, ctx, options = {}) {
        const classification = this.classifyError(error);
        logger.info(`Wrench: Classified error as ${classification.category}: ${classification.match || 'unknown'}`);

        let resolution = {
            handled: false,
            category: classification.category,
            originalError: classification.originalError,
        };

        // Handle based on category
        switch (classification.category) {
            case 'MISSING_DEPENDENCY': {
                const dependency = classification.match;
                const installCmd = this.getInstallCommand(dependency);

                if (installCmd && options.autoFix !== false) {
                    // Try to auto-install
                    resolution.suggestedAction = 'install_dependency';
                    resolution.dependency = dependency;
                    resolution.installCommand = installCmd;

                    if (ctx.isAdmin && options.autoExecute) {
                        const result = await this.executeShellFix(installCmd, ctx);
                        resolution.executed = true;
                        resolution.executionResult = result;
                        resolution.handled = result.success;
                    } else {
                        resolution.message = `Missing dependency: ${dependency}\nSuggested fix: \`${installCmd}\``;
                        resolution.requiresApproval = true;
                    }
                } else {
                    // Ask AI for help
                    const aiHelp = await this.askAIForHelp(error, { additionalInfo: `Missing: ${dependency}` });
                    if (aiHelp) {
                        resolution.aiSuggestion = aiHelp;
                        resolution.message = aiHelp.solution?.instructions || aiHelp.diagnosis;
                    }
                }
                break;
            }

            case 'MISSING_API_KEY': {
                const service = classification.match || 'unknown';
                resolution.suggestedAction = 'request_api_key';
                resolution.service = service;
                
                const keyRequest = await this.requestAPIKey(service, ctx);
                resolution.keyRequest = keyRequest;
                
                if (keyRequest.waitingForKey) {
                    resolution.message = `🔑 I need a ${service} API key to proceed.\n\nPlease DM me your API key, and I'll store it securely.`;
                    resolution.awaitingUserInput = true;
                }
                break;
            }

            case 'PERMISSION_ERROR': {
                resolution.suggestedAction = 'elevate_permissions';
                resolution.message = '⚠️ Permission denied. This operation may require elevated privileges.';
                
                // Ask AI for specific advice
                const aiHelp = await this.askAIForHelp(error);
                if (aiHelp) {
                    resolution.aiSuggestion = aiHelp;
                    resolution.message += `\n\n${aiHelp.solution?.instructions || aiHelp.diagnosis}`;
                }
                break;
            }

            case 'NETWORK_ERROR': {
                resolution.suggestedAction = 'retry_later';
                resolution.message = '🌐 Network error detected. Please check your internet connection and try again.';
                resolution.retryable = true;
                break;
            }

            case 'RATE_LIMIT': {
                resolution.suggestedAction = 'wait_and_retry';
                resolution.message = '⏱️ Rate limit reached. Please wait a moment before trying again.';
                resolution.retryable = true;
                resolution.retryAfter = 60000; // 1 minute default
                break;
            }

            default: {
                // Unknown error - ask AI for help
                const aiHelp = await this.askAIForHelp(error);
                if (aiHelp) {
                    resolution.aiSuggestion = aiHelp;
                    resolution.message = aiHelp.solution?.instructions || aiHelp.diagnosis;
                    
                    if (aiHelp.solution_type === 'shell_command' && aiHelp.solution?.command) {
                        resolution.suggestedAction = 'execute_command';
                        resolution.suggestedCommand = aiHelp.solution.command;
                        
                        if (ctx.isAdmin && options.autoExecute && aiHelp.confidence > 0.8) {
                            const result = await this.executeShellFix(aiHelp.solution.command, ctx);
                            resolution.executed = true;
                            resolution.executionResult = result;
                            resolution.handled = result.success;
                        }
                    }
                } else {
                    resolution.message = `❌ An error occurred: ${classification.originalError}`;
                }
                break;
            }
        }

        return resolution;
    }
}

// Create singleton instance
let wrenchHandler = null;

module.exports = new Plugin({
    name: 'wrench',
    description: 'AI-powered error resolution system - automatically diagnoses and fixes issues',
    version: '1.0.0',
    author: 'FreppeBot',

    // Initialize the wrench handler when plugin loads
    onLoad: async (bot) => {
        const config = bot.getConfig();
        wrenchHandler = new WrenchErrorHandler({
            openrouterKey: config.openrouterKey,
            model: config.defaultModel,
        });
        logger.info('🔧 Wrench error handler initialized');
    },

    commands: {
        wrench: {
            description: 'Diagnose and fix errors: !wrench <error message>',
            handler: async (ctx, args) => {
                if (args.length === 0) {
                    return helpers.info(
                        '🔧 **Freppe Wrench - Error Resolution System**\n\n' +
                        'Usage: `!wrench <error message>`\n\n' +
                        'I can help diagnose and fix:\n' +
                        '• Missing dependencies (yt-dlp, ffmpeg, etc.)\n' +
                        '• Missing API keys\n' +
                        '• Permission errors\n' +
                        '• Network issues\n' +
                        '• And more!\n\n' +
                        'Just paste the error message and I\'ll suggest a fix.'
                    );
                }

                const errorMessage = args.join(' ');
                
                if (!wrenchHandler) {
                    return helpers.error('Wrench handler not initialized');
                }

                await ctx.reply('🔧 Analyzing error...');
                
                const resolution = await wrenchHandler.resolveError(errorMessage, ctx, {
                    autoFix: false, // Don't auto-execute from command
                    autoExecute: false,
                });

                let response = `🔧 **Error Analysis**\n\n`;
                response += `**Category:** ${resolution.category}\n`;
                
                if (resolution.message) {
                    response += `\n${resolution.message}\n`;
                }

                if (resolution.suggestedCommand) {
                    response += `\n**Suggested Command:**\n\`\`\`bash\n${resolution.suggestedCommand}\n\`\`\`\n`;
                }

                if (resolution.installCommand) {
                    response += `\n**Install Command:**\n\`\`\`bash\n${resolution.installCommand}\n\`\`\`\n`;
                }

                if (resolution.aiSuggestion) {
                    response += `\n**AI Confidence:** ${Math.round((resolution.aiSuggestion.confidence || 0) * 100)}%`;
                }

                return response;
            },
        },

        fix: {
            description: 'Auto-fix an error (admin only): !fix <error message>',
            requiresAdmin: true,
            handler: async (ctx, args) => {
                if (!ctx.isAdmin) {
                    return helpers.error('This command requires admin privileges');
                }

                if (args.length === 0) {
                    return helpers.error('Usage: !fix <error message>');
                }

                const errorMessage = args.join(' ');
                
                if (!wrenchHandler) {
                    return helpers.error('Wrench handler not initialized');
                }

                await ctx.reply('🔧 Analyzing and attempting to fix...');
                
                const resolution = await wrenchHandler.resolveError(errorMessage, ctx, {
                    autoFix: true,
                    autoExecute: true,
                });

                let response = `🔧 **Auto-Fix Result**\n\n`;
                response += `**Category:** ${resolution.category}\n`;

                if (resolution.executed) {
                    if (resolution.executionResult.success) {
                        response += `\n✅ **Fix Applied Successfully!**\n`;
                        if (resolution.executionResult.stdout) {
                            response += `\n**Output:**\n\`\`\`\n${helpers.truncate(resolution.executionResult.stdout, 500)}\n\`\`\``;
                        }
                    } else {
                        response += `\n❌ **Fix Failed:**\n${resolution.executionResult.error}\n`;
                    }
                } else if (resolution.message) {
                    response += `\n${resolution.message}\n`;
                }

                return response;
            },
        },
    },

    tools: {
        diagnoseError: {
            description: 'Diagnose an error and get AI-powered suggestions for fixing it',
            parameters: {
                error: {
                    type: 'string',
                    description: 'The error message to diagnose',
                },
                context: {
                    type: 'string',
                    description: 'Additional context about what was being attempted',
                    required: false,
                },
            },
            execute: async (params, ctx) => {
                if (!wrenchHandler) {
                    return { error: 'Wrench handler not initialized' };
                }

                const resolution = await wrenchHandler.resolveError(params.error, ctx, {
                    autoFix: false,
                    autoExecute: false,
                });

                return {
                    category: resolution.category,
                    diagnosis: resolution.message,
                    suggestedAction: resolution.suggestedAction,
                    suggestedCommand: resolution.suggestedCommand || resolution.installCommand,
                    aiSuggestion: resolution.aiSuggestion,
                    requiresApproval: resolution.requiresApproval,
                    retryable: resolution.retryable,
                };
            },
        },

        autoFixError: {
            description: 'Automatically attempt to fix an error (admin only)',
            requiresAdmin: true,
            parameters: {
                error: {
                    type: 'string',
                    description: 'The error message to fix',
                },
            },
            execute: async (params, ctx) => {
                if (!ctx.isAdmin) {
                    return { error: 'Admin privileges required for auto-fix' };
                }

                if (!wrenchHandler) {
                    return { error: 'Wrench handler not initialized' };
                }

                const resolution = await wrenchHandler.resolveError(params.error, ctx, {
                    autoFix: true,
                    autoExecute: true,
                });

                return {
                    handled: resolution.handled,
                    category: resolution.category,
                    executed: resolution.executed,
                    executionResult: resolution.executionResult,
                    message: resolution.message,
                };
            },
        },

        installDependency: {
            description: 'Install a missing system dependency (admin only)',
            requiresAdmin: true,
            parameters: {
                dependency: {
                    type: 'string',
                    description: 'Name of the dependency to install (e.g., yt-dlp, ffmpeg)',
                },
            },
            execute: async (params, ctx) => {
                if (!ctx.isAdmin) {
                    return { error: 'Admin privileges required' };
                }

                if (!wrenchHandler) {
                    return { error: 'Wrench handler not initialized' };
                }

                const installCmd = wrenchHandler.getInstallCommand(params.dependency);
                
                if (!installCmd) {
                    return {
                        error: `Unknown dependency: ${params.dependency}`,
                        suggestion: `Try: npm install -g ${params.dependency}`,
                    };
                }

                const result = await wrenchHandler.executeShellFix(installCmd, ctx);
                
                return {
                    dependency: params.dependency,
                    command: installCmd,
                    success: result.success,
                    output: result.stdout || result.stderr,
                    error: result.error,
                };
            },
        },

        requestAPIKey: {
            description: 'Request an API key from the user for a specific service',
            parameters: {
                service: {
                    type: 'string',
                    description: 'Name of the service (e.g., openai, anthropic, discord)',
                },
            },
            execute: async (params, ctx) => {
                if (!wrenchHandler) {
                    return { error: 'Wrench handler not initialized' };
                }

                const result = await wrenchHandler.requestAPIKey(params.service, ctx);
                return result;
            },
        },
    },
});

// Export the handler class for use by other modules
module.exports.WrenchErrorHandler = WrenchErrorHandler;
module.exports.getWrenchHandler = () => wrenchHandler;
