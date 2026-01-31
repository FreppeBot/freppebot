/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     SHELL PLUGIN                               ║
 * ║                                                                 ║
 * ║   Execute shell commands (admin only for safety)               ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const { Plugin, helpers } = require('../../src/plugins/sdk');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

module.exports = new Plugin({
    name: 'shell',
    description: 'Execute shell commands on the host system',
    version: '1.0.0',
    author: 'FreppeBot',
    requiresAdmin: true, // Only admins can use this plugin

    commands: {
        shell: {
            description: 'Execute a shell command: !shell <command>',
            requiresAdmin: true,
            handler: async (ctx, args) => {
                if (!ctx.isAdmin) {
                    return helpers.error('This command requires admin privileges');
                }

                if (args.length === 0) {
                    return helpers.error('Usage: !shell <command>');
                }

                const command = args.join(' ');

                try {
                    await ctx.reply(`⏳ Executing: \`${command}\``);
                    const { stdout, stderr } = await execAsync(command, {
                        timeout: 30000, // 30 second timeout
                        maxBuffer: 1024 * 1024, // 1MB max output
                    });

                    let output = stdout || stderr || '(no output)';
                    output = helpers.truncate(output, 1500);

                    return helpers.code(output, 'bash');
                } catch (error) {
                    return helpers.error(`Command failed: ${error.message}`);
                }
            },
        },
    },

    tools: {
        executeCommand: {
            description: 'Execute a shell command on the host system. Use with caution!',
            requiresAdmin: true,
            parameters: {
                command: {
                    type: 'string',
                    description: 'The shell command to execute',
                },
                timeout: {
                    type: 'number',
                    description: 'Timeout in milliseconds (default: 30000)',
                    required: false,
                },
            },
            execute: async (params, ctx) => {
                if (!ctx.isAdmin) {
                    return { error: 'Admin privileges required' };
                }

                try {
                    const { stdout, stderr } = await execAsync(params.command, {
                        timeout: params.timeout || 30000,
                        maxBuffer: 1024 * 1024,
                    });

                    return {
                        success: true,
                        stdout: helpers.truncate(stdout || '', 2000),
                        stderr: helpers.truncate(stderr || '', 500),
                    };
                } catch (error) {
                    return {
                        success: false,
                        error: error.message,
                        stdout: error.stdout || '',
                        stderr: error.stderr || '',
                    };
                }
            },
        },
    },
});
