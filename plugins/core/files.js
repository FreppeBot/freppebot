/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     FILES PLUGIN                               ║
 * ║                                                                 ║
 * ║   File system operations (admin only)                          ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const { Plugin, helpers } = require('../../src/plugins/sdk');
const fs = require('fs').promises;
const path = require('path');

module.exports = new Plugin({
    name: 'files',
    description: 'Read, write, and manage files on the system',
    version: '1.0.0',
    author: 'FreppeBot',
    requiresAdmin: true,

    commands: {
        ls: {
            description: 'List files in a directory: !ls [path]',
            requiresAdmin: true,
            handler: async (ctx, args) => {
                const targetPath = args[0] || '.';

                try {
                    const entries = await fs.readdir(targetPath, { withFileTypes: true });

                    let output = `📁 **Contents of ${targetPath}**\n\n`;

                    const dirs = entries.filter(e => e.isDirectory()).map(e => `📁 ${e.name}/`);
                    const files = entries.filter(e => e.isFile()).map(e => `📄 ${e.name}`);

                    output += dirs.join('\n') + '\n' + files.join('\n');

                    return output || '(empty directory)';
                } catch (error) {
                    return helpers.error(`Cannot list directory: ${error.message}`);
                }
            },
        },

        cat: {
            description: 'Read a file: !cat <path>',
            requiresAdmin: true,
            handler: async (ctx, args) => {
                if (args.length === 0) {
                    return helpers.error('Usage: !cat <path>');
                }

                try {
                    const content = await fs.readFile(args[0], 'utf-8');
                    const truncated = helpers.truncate(content, 1500);
                    return helpers.code(truncated);
                } catch (error) {
                    return helpers.error(`Cannot read file: ${error.message}`);
                }
            },
        },
    },

    tools: {
        readFile: {
            description: 'Read the contents of a file',
            requiresAdmin: true,
            parameters: {
                path: {
                    type: 'string',
                    description: 'Path to the file to read',
                },
            },
            execute: async (params) => {
                try {
                    const content = await fs.readFile(params.path, 'utf-8');
                    return {
                        success: true,
                        content: helpers.truncate(content, 4000),
                        path: params.path,
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },

        writeFile: {
            description: 'Write content to a file (creates or overwrites)',
            requiresAdmin: true,
            parameters: {
                path: {
                    type: 'string',
                    description: 'Path to the file to write',
                },
                content: {
                    type: 'string',
                    description: 'Content to write to the file',
                },
            },
            execute: async (params) => {
                try {
                    // Create directory if needed
                    const dir = path.dirname(params.path);
                    await fs.mkdir(dir, { recursive: true });

                    await fs.writeFile(params.path, params.content, 'utf-8');
                    return { success: true, path: params.path };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },

        listDirectory: {
            description: 'List files and directories in a path',
            requiresAdmin: true,
            parameters: {
                path: {
                    type: 'string',
                    description: 'Directory path to list',
                },
            },
            execute: async (params) => {
                try {
                    const entries = await fs.readdir(params.path, { withFileTypes: true });

                    const items = entries.map(e => ({
                        name: e.name,
                        type: e.isDirectory() ? 'directory' : 'file',
                    }));

                    return { success: true, path: params.path, items };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },

        deleteFile: {
            description: 'Delete a file (use with caution!)',
            requiresAdmin: true,
            parameters: {
                path: {
                    type: 'string',
                    description: 'Path to the file to delete',
                },
            },
            execute: async (params) => {
                try {
                    await fs.unlink(params.path);
                    return { success: true, deleted: params.path };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },
    },
});
