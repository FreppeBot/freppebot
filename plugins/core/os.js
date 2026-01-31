/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                      OS / SYSTEM PLUGIN                        ║
 * ║                                                                 ║
 * ║   Provides OS-level access: files, commands, processes         ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const { Plugin } = require('../../src/plugins/sdk');
const fs = require('fs').promises;
const path = require('path');
const { exec, spawn } = require('child_process');
const os = require('os');

// Helper to run commands safely
function runCommand(cmd, cwd = process.cwd()) {
    return new Promise((resolve, reject) => {
        exec(cmd, { cwd, timeout: 30000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                resolve({ success: false, error: error.message, stderr });
            } else {
                resolve({ success: true, stdout: stdout.trim(), stderr: stderr.trim() });
            }
        });
    });
}

module.exports = new Plugin({
    name: 'os',
    description: 'OS-level file and command access',
    version: '1.0.0',

    commands: {
        run: {
            description: 'Run a shell command: !run <command>',
            handler: async (ctx, args) => {
                if (!ctx.isAdmin) return '❌ Admin only';
                if (args.length === 0) return 'Usage: !run <command>';

                const cmd = args.join(' ');
                const result = await runCommand(cmd);

                if (result.success) {
                    return result.stdout || '(no output)';
                } else {
                    return `Error: ${result.error}`;
                }
            },
        },

        read: {
            description: 'Read a file: !read <path>',
            handler: async (ctx, args) => {
                if (!ctx.isAdmin) return '❌ Admin only';
                if (args.length === 0) return 'Usage: !read <path>';

                try {
                    const content = await fs.readFile(args[0], 'utf-8');
                    if (content.length > 2000) {
                        return content.substring(0, 2000) + '\n... (truncated)';
                    }
                    return content;
                } catch (e) {
                    return `Error: ${e.message}`;
                }
            },
        },

        write: {
            description: 'Write to file: !write <path> | <content>',
            handler: async (ctx, args) => {
                if (!ctx.isAdmin) return '❌ Admin only';

                const full = args.join(' ');
                const [filePath, ...contentParts] = full.split('|');
                const content = contentParts.join('|').trim();

                if (!filePath || !content) {
                    return 'Usage: !write <path> | <content>';
                }

                try {
                    await fs.writeFile(filePath.trim(), content);
                    return `✓ Written to ${filePath.trim()}`;
                } catch (e) {
                    return `Error: ${e.message}`;
                }
            },
        },

        ls: {
            description: 'List directory: !ls [path]',
            handler: async (ctx, args) => {
                const dir = args[0] || process.cwd();
                try {
                    const entries = await fs.readdir(dir, { withFileTypes: true });
                    const formatted = entries.map(e =>
                        (e.isDirectory() ? '📁 ' : '📄 ') + e.name
                    ).join('\n');
                    return formatted || '(empty)';
                } catch (e) {
                    return `Error: ${e.message}`;
                }
            },
        },
    },

    tools: {
        readFile: {
            description: 'Read contents of a file from the filesystem',
            parameters: {
                path: { type: 'string', description: 'Absolute or relative file path' },
            },
            execute: async (params) => {
                try {
                    const content = await fs.readFile(params.path, 'utf-8');
                    return { success: true, content: content.substring(0, 5000) };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            },
        },

        writeFile: {
            description: 'Write content to a file',
            parameters: {
                path: { type: 'string', description: 'File path to write to' },
                content: { type: 'string', description: 'Content to write' },
            },
            execute: async (params) => {
                try {
                    const dir = path.dirname(params.path);
                    await fs.mkdir(dir, { recursive: true });
                    await fs.writeFile(params.path, params.content);
                    return { success: true, path: params.path };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            },
        },

        listDirectory: {
            description: 'List files and folders in a directory',
            parameters: {
                path: { type: 'string', description: 'Directory path (default: current)' },
            },
            execute: async (params) => {
                try {
                    const dir = params.path || process.cwd();
                    const entries = await fs.readdir(dir, { withFileTypes: true });
                    return {
                        success: true,
                        path: dir,
                        entries: entries.map(e => ({
                            name: e.name,
                            type: e.isDirectory() ? 'directory' : 'file',
                        })),
                    };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            },
        },

        runCommand: {
            description: 'Execute a shell command on the system',
            parameters: {
                command: { type: 'string', description: 'Shell command to run' },
                cwd: { type: 'string', description: 'Working directory (optional)' },
            },
            execute: async (params) => {
                return await runCommand(params.command, params.cwd || process.cwd());
            },
        },

        openFile: {
            description: 'Open a file with the default system application',
            parameters: {
                path: { type: 'string', description: 'File path to open' },
            },
            execute: async (params) => {
                const isWin = process.platform === 'win32';
                const cmd = isWin ? `start "" "${params.path}"` : `open "${params.path}"`;
                return await runCommand(cmd);
            },
        },

        getSystemInfo: {
            description: 'Get system information (OS, memory, uptime)',
            parameters: {},
            execute: async () => {
                return {
                    platform: os.platform(),
                    arch: os.arch(),
                    hostname: os.hostname(),
                    homeDir: os.homedir(),
                    cwd: process.cwd(),
                    totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024) + ' GB',
                    freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024) + ' GB',
                    uptime: Math.round(os.uptime() / 3600) + ' hours',
                };
            },
        },

        deleteFile: {
            description: 'Delete a file or directory',
            parameters: {
                path: { type: 'string', description: 'Path to delete' },
            },
            execute: async (params) => {
                try {
                    await fs.rm(params.path, { recursive: true });
                    return { success: true, deleted: params.path };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            },
        },

        moveFile: {
            description: 'Move or rename a file',
            parameters: {
                from: { type: 'string', description: 'Source path' },
                to: { type: 'string', description: 'Destination path' },
            },
            execute: async (params) => {
                try {
                    await fs.rename(params.from, params.to);
                    return { success: true, from: params.from, to: params.to };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            },
        },

        copyFile: {
            description: 'Copy a file to another location',
            parameters: {
                from: { type: 'string', description: 'Source path' },
                to: { type: 'string', description: 'Destination path' },
            },
            execute: async (params) => {
                try {
                    await fs.copyFile(params.from, params.to);
                    return { success: true, from: params.from, to: params.to };
                } catch (e) {
                    return { success: false, error: e.message };
                }
            },
        },
    },
});
