/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     PLUGIN MANAGER CLI                         ║
 * ║                                                                 ║
 * ║   Download and manage plugins from URLs (like npm)            ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const chalk = require('chalk');
// Plugin validation will be done by requiring the file directly

class PluginManager {
    constructor() {
        this.pluginsDir = path.join(process.cwd(), 'plugins', 'community');
        this.installedPlugins = new Map(); // name -> { url, version, installedAt }
        this.metadataFile = path.join(this.pluginsDir, '.freppe-plugins.json');
        
        // Ensure plugins directory exists
        if (!fs.existsSync(this.pluginsDir)) {
            fs.mkdirSync(this.pluginsDir, { recursive: true });
        }
        
        this.loadInstalledPlugins();
    }

    /**
     * Load metadata about installed plugins
     */
    loadInstalledPlugins() {
        if (fs.existsSync(this.metadataFile)) {
            try {
                const data = JSON.parse(fs.readFileSync(this.metadataFile, 'utf-8'));
                this.installedPlugins = new Map(Object.entries(data));
            } catch (error) {
                console.warn(chalk.yellow('Warning: Could not load plugin metadata'));
            }
        }
    }

    /**
     * Save metadata about installed plugins
     */
    saveInstalledPlugins() {
        const data = Object.fromEntries(this.installedPlugins);
        fs.writeFileSync(this.metadataFile, JSON.stringify(data, null, 2));
    }

    /**
     * Download a file from URL
     */
    async downloadFile(url, outputPath) {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const client = parsedUrl.protocol === 'https:' ? https : http;

            const file = fs.createWriteStream(outputPath);
            
            client.get(url, (response) => {
                if (response.statusCode === 301 || response.statusCode === 302) {
                    // Handle redirects
                    return this.downloadFile(response.headers.location, outputPath)
                        .then(resolve)
                        .catch(reject);
                }

                if (response.statusCode !== 200) {
                    file.close();
                    fs.unlinkSync(outputPath);
                    reject(new Error(`Failed to download: ${response.statusCode} ${response.statusMessage}`));
                    return;
                }

                response.pipe(file);

                file.on('finish', () => {
                    file.close();
                    resolve();
                });
            }).on('error', (err) => {
                file.close();
                if (fs.existsSync(outputPath)) {
                    fs.unlinkSync(outputPath);
                }
                reject(err);
            });
        });
    }

    /**
     * Convert GitHub URL to raw content URL
     */
    normalizeUrl(url) {
        try {
            const parsed = new URL(url);
            
            // GitHub repository URL -> raw content
            if (parsed.hostname === 'github.com' || parsed.hostname === 'www.github.com') {
                const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)\/(?:blob|raw)\/([^\/]+)\/(.+)/);
                if (match) {
                    const [, owner, repo, branch, filePath] = match;
                    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
                }
                
                // Try to get main/master branch
                const repoMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
                if (repoMatch) {
                    const [, owner, repo] = repoMatch;
                    // Assume it's a plugin file in the repo root
                    return `https://raw.githubusercontent.com/${owner}/${repo}/main/plugin.js`;
                }
            }
            
            // Already a raw URL or direct link
            return url;
        } catch (error) {
            return url;
        }
    }

    /**
     * Extract plugin name from URL or content
     */
    extractPluginName(url, content) {
        // Try to get name from plugin code
        const nameMatch = content.match(/name:\s*['"]([^'"]+)['"]/);
        if (nameMatch) {
            return nameMatch[1];
        }

        // Try to get from URL filename
        try {
            const parsed = new URL(url);
            const pathname = parsed.pathname;
            const filename = path.basename(pathname, path.extname(pathname));
            if (filename && filename !== 'plugin' && filename !== 'index') {
                return filename;
            }
        } catch (error) {
            // Ignore
        }

        // Default name
        return `plugin-${Date.now()}`;
    }

    /**
     * Validate plugin code
     */
    validatePlugin(content, filename) {
        try {
            // Check if it's valid JavaScript
            // Basic checks
            if (!content.trim()) {
                throw new Error('Plugin file is empty');
            }

            // Check for Plugin export
            if (!content.includes('Plugin') && !content.includes('module.exports')) {
                throw new Error('Plugin does not export a Plugin instance');
            }

            // Try to require it (in a safe way)
            try {
                // Create a temporary file and try to require it
                const tempFile = path.join(this.pluginsDir, `.temp-${Date.now()}.js`);
                fs.writeFileSync(tempFile, content);
                
                // Clear require cache for temp file
                const tempFileResolved = path.resolve(tempFile);
                delete require.cache[tempFileResolved];
                
                // Try to load it
                let plugin;
                try {
                    plugin = require(tempFile);
                } catch (requireError) {
                    // Clean up temp file
                    if (fs.existsSync(tempFile)) {
                        fs.unlinkSync(tempFile);
                    }
                    throw new Error(`Plugin failed to load: ${requireError.message}`);
                }
                
                // Clean up temp file
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                }
                
                // Clear from cache again
                delete require.cache[tempFileResolved];
                
                // Check if it's a Plugin instance
                if (!plugin || typeof plugin !== 'object') {
                    throw new Error('Plugin must export a Plugin instance');
                }

                // Check for required fields
                if (!plugin.name) {
                    throw new Error('Plugin must have a name');
                }
                if (!plugin.description) {
                    throw new Error('Plugin must have a description');
                }

                return { valid: true, plugin };
            } catch (error) {
                // If temp file exists, clean it up
                const tempFile = path.join(this.pluginsDir, `.temp-${Date.now()}.js`);
                if (fs.existsSync(tempFile)) {
                    try {
                        fs.unlinkSync(tempFile);
                        delete require.cache[path.resolve(tempFile)];
                    } catch (e) {
                        // Ignore
                    }
                }
                throw error;
            }
        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    /**
     * Download and install a plugin from URL
     */
    async download(url, options = {}) {
        const { name: customName, force = false } = options;
        
        console.log(chalk.blue(`📦 Downloading plugin from: ${url}`));

        try {
            // Normalize URL (handle GitHub URLs)
            const normalizedUrl = this.normalizeUrl(url);
            console.log(chalk.gray(`   Normalized URL: ${normalizedUrl}`));

            // Download the file
            const tempFile = path.join(this.pluginsDir, `.temp-${Date.now()}.js`);
            await this.downloadFile(normalizedUrl, tempFile);

            // Read the content
            const content = fs.readFileSync(tempFile, 'utf-8');

            // Validate the plugin
            console.log(chalk.blue('   Validating plugin...'));
            const validation = this.validatePlugin(content, path.basename(normalizedUrl));
            
            if (!validation.valid) {
                fs.unlinkSync(tempFile);
                throw new Error(`Plugin validation failed: ${validation.error}`);
            }

            const plugin = validation.plugin;
            const pluginName = customName || plugin.name || this.extractPluginName(normalizedUrl, content);

            // Check if plugin already exists
            const pluginFile = path.join(this.pluginsDir, `${pluginName}.js`);
            if (fs.existsSync(pluginFile) && !force) {
                fs.unlinkSync(tempFile);
                throw new Error(`Plugin "${pluginName}" already exists. Use --force to overwrite.`);
            }

            // Move temp file to final location
            fs.renameSync(tempFile, pluginFile);

            // Save metadata
            this.installedPlugins.set(pluginName, {
                url: normalizedUrl,
                originalUrl: url,
                version: plugin.version || '1.0.0',
                installedAt: new Date().toISOString(),
                description: plugin.description,
            });
            this.saveInstalledPlugins();

            console.log(chalk.green(`✅ Plugin "${pluginName}" installed successfully!`));
            console.log(chalk.gray(`   Location: ${pluginFile}`));
            console.log(chalk.gray(`   Version: ${plugin.version || '1.0.0'}`));
            console.log(chalk.gray(`   Description: ${plugin.description || 'N/A'}`));

            return {
                success: true,
                name: pluginName,
                file: pluginFile,
                plugin,
            };
        } catch (error) {
            console.error(chalk.red(`❌ Failed to download plugin: ${error.message}`));
            return {
                success: false,
                error: error.message,
            };
        }
    }

    /**
     * List installed plugins
     */
    list() {
        const files = fs.readdirSync(this.pluginsDir)
            .filter(file => file.endsWith('.js') && !file.startsWith('.') && file !== '.freppe-plugins.json');

        if (files.length === 0) {
            console.log(chalk.yellow('No plugins installed.'));
            return;
        }

        console.log(chalk.blue(`\n📦 Installed Plugins (${files.length}):\n`));

        for (const file of files) {
            const pluginPath = path.join(this.pluginsDir, file);
            const pluginName = path.basename(file, '.js');
            const metadata = this.installedPlugins.get(pluginName);

            try {
                // Try to load plugin info
                delete require.cache[require.resolve(pluginPath)];
                const plugin = require(pluginPath);

                console.log(chalk.cyan(`  ${plugin.name || pluginName}`));
                if (plugin.description) {
                    console.log(chalk.gray(`    ${plugin.description}`));
                }
                console.log(chalk.gray(`    Version: ${plugin.version || 'N/A'}`));
                console.log(chalk.gray(`    File: ${file}`));
                if (metadata) {
                    console.log(chalk.gray(`    Installed: ${new Date(metadata.installedAt).toLocaleString()}`));
                    if (metadata.originalUrl) {
                        console.log(chalk.gray(`    Source: ${metadata.originalUrl}`));
                    }
                }
                console.log('');
            } catch (error) {
                console.log(chalk.yellow(`  ${pluginName} (error loading: ${error.message})`));
                console.log('');
            }
        }
    }

    /**
     * Remove a plugin
     */
    remove(pluginName) {
        const pluginFile = path.join(this.pluginsDir, `${pluginName}.js`);

        if (!fs.existsSync(pluginFile)) {
            console.error(chalk.red(`❌ Plugin "${pluginName}" not found.`));
            return { success: false, error: 'Plugin not found' };
        }

        try {
            fs.unlinkSync(pluginFile);
            this.installedPlugins.delete(pluginName);
            this.saveInstalledPlugins();

            console.log(chalk.green(`✅ Plugin "${pluginName}" removed successfully!`));
            return { success: true };
        } catch (error) {
            console.error(chalk.red(`❌ Failed to remove plugin: ${error.message}`));
            return { success: false, error: error.message };
        }
    }

    /**
     * Update a plugin (re-download from original URL)
     */
    async update(pluginName) {
        const metadata = this.installedPlugins.get(pluginName);

        if (!metadata) {
            console.error(chalk.red(`❌ Plugin "${pluginName}" not found in metadata.`));
            console.log(chalk.yellow('   Try removing and re-installing it.'));
            return { success: false, error: 'Plugin not in metadata' };
        }

        const originalUrl = metadata.originalUrl || metadata.url;
        if (!originalUrl) {
            console.error(chalk.red(`❌ No URL found for plugin "${pluginName}".`));
            return { success: false, error: 'No URL found' };
        }

        console.log(chalk.blue(`🔄 Updating plugin "${pluginName}"...`));
        
        // Remove old version
        this.remove(pluginName);
        
        // Download new version
        return await this.download(originalUrl, { name: pluginName, force: true });
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    const manager = new PluginManager();

    if (!command) {
        console.log(chalk.blue('FreppeBot Plugin Manager\n'));
        console.log('Usage:');
        console.log('  npm run plugin download <url>     Download and install a plugin');
        console.log('  npm run plugin list                List installed plugins');
        console.log('  npm run plugin remove <name>        Remove a plugin');
        console.log('  npm run plugin update <name>       Update a plugin');
        console.log('\nExamples:');
        console.log('  npm run plugin download https://raw.githubusercontent.com/user/repo/main/plugin.js');
        console.log('  npm run plugin download https://github.com/user/repo/blob/main/plugin.js');
        console.log('  npm run plugin list');
        console.log('  npm run plugin remove my-plugin');
        console.log('  npm run plugin update my-plugin');
        process.exit(0);
    }

    try {
        switch (command) {
            case 'download':
            case 'install':
                if (!args[1]) {
                    console.error(chalk.red('❌ Error: URL required'));
                    console.log('Usage: npm run plugin download <url>');
                    process.exit(1);
                }
                const url = args[1];
                const force = args.includes('--force') || args.includes('-f');
                await manager.download(url, { force });
                break;

            case 'list':
            case 'ls':
                manager.list();
                break;

            case 'remove':
            case 'rm':
            case 'uninstall':
                if (!args[1]) {
                    console.error(chalk.red('❌ Error: Plugin name required'));
                    console.log('Usage: npm run plugin remove <name>');
                    process.exit(1);
                }
                manager.remove(args[1]);
                break;

            case 'update':
            case 'upgrade':
                if (!args[1]) {
                    console.error(chalk.red('❌ Error: Plugin name required'));
                    console.log('Usage: npm run plugin update <name>');
                    process.exit(1);
                }
                await manager.update(args[1]);
                break;

            default:
                console.error(chalk.red(`❌ Unknown command: ${command}`));
                console.log('Run "npm run plugin" for help');
                process.exit(1);
        }
    } catch (error) {
        console.error(chalk.red(`❌ Error: ${error.message}`));
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = PluginManager;

