/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     PLUGIN REGISTRY                            ║
 * ║                                                                 ║
 * ║   Central registry for all loaded plugins, commands, and tools║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const logger = require('../utils/logger');

class PluginRegistry {
    constructor() {
        this.plugins = new Map();
        this.commands = new Map();
        this.tools = new Map();
    }

    /**
     * Register a plugin
     */
    register(plugin) {
        if (this.plugins.has(plugin.name)) {
            logger.warn(`Plugin ${plugin.name} already registered, replacing...`);
            this.unregister(plugin.name);
        }

        this.plugins.set(plugin.name, plugin);

        // Register commands
        for (const [cmdName, cmd] of Object.entries(plugin.commands || {})) {
            const fullName = cmdName; // Commands use simple names
            this.commands.set(fullName, {
                name: fullName,
                description: cmd.description,
                args: cmd.args || [],
                handler: cmd.handler,
                plugin: plugin.name,
                requiresAdmin: cmd.requiresAdmin || plugin.requiresAdmin,
            });
        }

        // Register tools
        for (const [toolName, tool] of Object.entries(plugin.tools || {})) {
            const fullName = `${plugin.name}_${toolName}`; // Tools use prefixed names
            this.tools.set(fullName, {
                name: fullName,
                description: tool.description,
                parameters: tool.parameters || {},
                execute: tool.execute,
                plugin: plugin.name,
                requiresAdmin: tool.requiresAdmin || plugin.requiresAdmin,
            });
        }

        logger.debug(`Registered plugin: ${plugin.name} (${Object.keys(plugin.commands || {}).length} commands, ${Object.keys(plugin.tools || {}).length} tools)`);
    }

    /**
     * Unregister a plugin
     */
    unregister(pluginName) {
        const plugin = this.plugins.get(pluginName);
        if (!plugin) return;

        // Remove commands
        for (const cmdName of Object.keys(plugin.commands || {})) {
            this.commands.delete(cmdName);
        }

        // Remove tools
        for (const toolName of Object.keys(plugin.tools || {})) {
            this.tools.delete(`${pluginName}_${toolName}`);
        }

        this.plugins.delete(pluginName);
        logger.debug(`Unregistered plugin: ${pluginName}`);
    }

    /**
     * Get a plugin by name
     */
    get(name) {
        return this.plugins.get(name);
    }

    /**
     * Get all plugins
     */
    getAllPlugins() {
        return Array.from(this.plugins.values());
    }

    /**
     * Get plugin count
     */
    getPluginCount() {
        return this.plugins.size;
    }

    /**
     * Get a command by name
     */
    getCommand(name) {
        return this.commands.get(name);
    }

    /**
     * Get all commands
     */
    getAllCommands() {
        return Array.from(this.commands.values());
    }

    /**
     * Get a tool by name
     */
    getTool(name) {
        return this.tools.get(name);
    }

    /**
     * Get all tools
     */
    getAllTools() {
        return Array.from(this.tools.values());
    }

    /**
     * Get AI tool definitions for function calling
     * @param {boolean} includeAdmin Include admin-only tools
     */
    getAITools(includeAdmin = false) {
        const tools = [];

        for (const tool of this.tools.values()) {
            if (tool.requiresAdmin && !includeAdmin) continue;

            tools.push({
                type: 'function',
                function: {
                    name: tool.name,
                    description: tool.description,
                    parameters: this._convertParameters(tool.parameters),
                },
            });
        }

        return tools;
    }

    _convertParameters(params) {
        const properties = {};
        const required = [];

        for (const [key, value] of Object.entries(params)) {
            if (typeof value === 'string') {
                properties[key] = { type: value };
                required.push(key);
            } else if (typeof value === 'object') {
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

module.exports = PluginRegistry;
