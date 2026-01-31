#!/usr/bin/env node

/**
 * FreppeBot CLI - Plugin Manager
 * 
 * Usage:
 *   freppe download <url>
 *   freppe list
 *   freppe remove <name>
 *   freppe update <name>
 */

const path = require('path');
const pluginManager = require('../src/cli/plugin-manager');

// Change to project directory
process.chdir(path.join(__dirname, '..'));

// Run the plugin manager
require('../src/cli/plugin-manager.js');

