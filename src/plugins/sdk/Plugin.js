/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     PLUGIN BASE CLASS                          ║
 * ║                                                                 ║
 * ║   Create plugins by extending this class or using the          ║
 * ║   simple object-based syntax.                                  ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

class Plugin {
    /**
     * Create a new plugin
     * @param {Object} config Plugin configuration
     * @param {string} config.name - Unique plugin name (required)
     * @param {string} config.description - What the plugin does (required)
     * @param {string} config.version - Plugin version (default: '1.0.0')
     * @param {string} config.author - Plugin author
     * @param {Object} config.commands - Command handlers
     * @param {Object} config.tools - AI tools this plugin provides
     * @param {Function} config.onLoad - Called when plugin loads
     * @param {Function} config.onUnload - Called when plugin unloads
     */
    constructor(config) {
        // Validate required fields
        if (!config.name) {
            throw new Error('Plugin must have a name');
        }
        if (!config.description) {
            throw new Error('Plugin must have a description');
        }

        this.name = config.name;
        this.description = config.description;
        this.version = config.version || '1.0.0';
        this.author = config.author || 'Unknown';
        this.commands = config.commands || {};
        this.tools = config.tools || {};
        this.requiresAdmin = config.requiresAdmin || false;

        // Lifecycle hooks
        this._onLoad = config.onLoad;
        this._onUnload = config.onUnload;

        // Validate commands
        this._validateCommands();

        // Validate tools
        this._validateTools();
    }

    _validateCommands() {
        for (const [name, cmd] of Object.entries(this.commands)) {
            if (!cmd.description) {
                throw new Error(`Command '${name}' must have a description`);
            }
            if (!cmd.handler || typeof cmd.handler !== 'function') {
                throw new Error(`Command '${name}' must have a handler function`);
            }
        }
    }

    _validateTools() {
        for (const [name, tool] of Object.entries(this.tools)) {
            if (!tool.description) {
                throw new Error(`Tool '${name}' must have a description`);
            }
            if (!tool.execute || typeof tool.execute !== 'function') {
                throw new Error(`Tool '${name}' must have an execute function`);
            }
        }
    }

    /**
     * Called when the plugin is loaded
     * Override this or pass onLoad in config
     */
    async onLoad(bot) {
        if (this._onLoad) {
            await this._onLoad(bot);
        }
    }

    /**
     * Called when the plugin is unloaded
     * Override this or pass onUnload in config
     */
    async onUnload() {
        if (this._onUnload) {
            await this._onUnload();
        }
    }

    /**
     * Get tool definitions for AI (OpenAI/Anthropic format)
     */
    getToolDefinitions() {
        const definitions = [];

        for (const [name, tool] of Object.entries(this.tools)) {
            definitions.push({
                type: 'function',
                function: {
                    name: `${this.name}_${name}`,
                    description: tool.description,
                    parameters: this._convertParameters(tool.parameters || {}),
                },
            });
        }

        return definitions;
    }

    _convertParameters(params) {
        const properties = {};
        const required = [];

        for (const [key, value] of Object.entries(params)) {
            if (typeof value === 'string') {
                // Simple type: { location: 'string' }
                properties[key] = { type: value };
                required.push(key);
            } else if (typeof value === 'object') {
                // Complex type: { location: { type: 'string', description: '...', required: false } }
                properties[key] = {
                    type: value.type || 'string',
                    description: value.description,
                };
                if (value.enum) {
                    properties[key].enum = value.enum;
                }
                if (value.required !== false) {
                    required.push(key);
                }
            }
        }

        return {
            type: 'object',
            properties,
            required,
        };
    }
}

module.exports = Plugin;
