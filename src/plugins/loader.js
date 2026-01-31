/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     PLUGIN LOADER                              ║
 * ║                                                                 ║
 * ║   Loads plugins from the plugins/ directory with hot-reload   ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const logger = require('../utils/logger');

class PluginLoader {
    constructor(registry, options = {}) {
        this.registry = registry;
        this.hotReload = options.hotReload || false;
        this.disabledPlugins = options.disabledPlugins || [];
        this.pluginsDir = path.join(process.cwd(), 'plugins');
        this.watcher = null;
        this.loadedFiles = new Map(); // file path -> plugin name
    }

    /**
     * Load all plugins from the plugins directory
     */
    async loadPlugins() {
        // Ensure plugins directory exists
        if (!fs.existsSync(this.pluginsDir)) {
            fs.mkdirSync(this.pluginsDir, { recursive: true });
            logger.info(`Created plugins directory: ${this.pluginsDir}`);
        }

        // Load core plugins
        const coreDir = path.join(this.pluginsDir, 'core');
        if (fs.existsSync(coreDir)) {
            await this.loadPluginsFromDir(coreDir, 'core');
        }

        // Load community plugins
        const communityDir = path.join(this.pluginsDir, 'community');
        if (fs.existsSync(communityDir)) {
            await this.loadPluginsFromDir(communityDir, 'community');
        }

        // Load root-level plugins (single files)
        await this.loadPluginsFromDir(this.pluginsDir, 'root', false);

        // Start hot-reload watcher if enabled
        if (this.hotReload) {
            this.startWatcher();
        }
    }

    /**
     * Load plugins from a specific directory
     */
    async loadPluginsFromDir(dir, category, recursive = true) {
        if (!fs.existsSync(dir)) return;

        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isFile() && entry.name.endsWith('.js')) {
                await this.loadPlugin(fullPath);
            } else if (entry.isDirectory() && recursive && !entry.name.startsWith('.')) {
                // Check for index.js in subdirectory
                const indexPath = path.join(fullPath, 'index.js');
                if (fs.existsSync(indexPath)) {
                    await this.loadPlugin(indexPath);
                }
            }
        }
    }

    /**
     * Load a single plugin from file
     */
    async loadPlugin(filePath) {
        const fileName = path.basename(filePath, '.js');

        try {
            // Clear require cache for hot-reload
            delete require.cache[require.resolve(filePath)];

            // Load the plugin
            const plugin = require(filePath);

            // Check if it's a valid plugin
            if (!plugin || !plugin.name) {
                logger.warn(`Skipping ${fileName}: Not a valid plugin (missing name)`);
                return false;
            }

            // Check if disabled
            if (this.disabledPlugins.includes(plugin.name)) {
                logger.info(`Skipping disabled plugin: ${plugin.name}`);
                return false;
            }

            // Unload if already loaded (for hot-reload)
            if (this.loadedFiles.has(filePath)) {
                await this.unloadPlugin(filePath);
            }

            // Register the plugin
            this.registry.register(plugin);
            this.loadedFiles.set(filePath, plugin.name);

            // Call onLoad hook
            if (plugin.onLoad) {
                await plugin.onLoad();
            }

            logger.info(`✓ Loaded plugin: ${plugin.name} v${plugin.version}`);
            return true;

        } catch (error) {
            logger.error(`Failed to load plugin ${fileName}:`, error.message);
            return false;
        }
    }

    /**
     * Unload a plugin
     */
    async unloadPlugin(filePath) {
        const pluginName = this.loadedFiles.get(filePath);
        if (!pluginName) return;

        const plugin = this.registry.get(pluginName);
        if (plugin && plugin.onUnload) {
            try {
                await plugin.onUnload();
            } catch (error) {
                logger.error(`Error unloading plugin ${pluginName}:`, error);
            }
        }

        this.registry.unregister(pluginName);
        this.loadedFiles.delete(filePath);
        logger.info(`Unloaded plugin: ${pluginName}`);
    }

    /**
     * Start file watcher for hot-reload
     */
    startWatcher() {
        logger.info('Starting plugin hot-reload watcher...');

        this.watcher = chokidar.watch(this.pluginsDir, {
            ignored: /node_modules/,
            persistent: true,
            ignoreInitial: true,
        });

        this.watcher.on('add', async (filePath) => {
            if (filePath.endsWith('.js')) {
                logger.info(`New plugin detected: ${path.basename(filePath)}`);
                await this.loadPlugin(filePath);
            }
        });

        this.watcher.on('change', async (filePath) => {
            if (filePath.endsWith('.js')) {
                logger.info(`Plugin changed: ${path.basename(filePath)}`);
                await this.loadPlugin(filePath);
            }
        });

        this.watcher.on('unlink', async (filePath) => {
            if (filePath.endsWith('.js')) {
                logger.info(`Plugin removed: ${path.basename(filePath)}`);
                await this.unloadPlugin(filePath);
            }
        });
    }

    /**
     * Stop watcher and unload all plugins
     */
    async unloadAll() {
        if (this.watcher) {
            await this.watcher.close();
        }

        for (const filePath of this.loadedFiles.keys()) {
            await this.unloadPlugin(filePath);
        }
    }
}

module.exports = PluginLoader;
