/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     PASSWORD GENERATOR PLUGIN                  ║
 * ║                                                                 ║
 * ║   Generate secure passwords                                   ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const { Plugin, helpers } = require('../../src/plugins/sdk');

function generatePassword(length = 16, options = {}) {
    const {
        includeUppercase = true,
        includeLowercase = true,
        includeNumbers = true,
        includeSymbols = true,
    } = options;

    let charset = '';
    if (includeLowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
    if (includeUppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (includeNumbers) charset += '0123456789';
    if (includeSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

    if (charset.length === 0) {
        charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    }

    let password = '';
    for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }

    return password;
}

module.exports = new Plugin({
    name: 'password',
    description: 'Generate secure passwords',
    version: '1.0.0',
    author: 'FreppeBot',

    commands: {
        password: {
            description: 'Generate password: !password [length]',
            handler: async (ctx, args) => {
                const length = parseInt(args[0]) || 16;
                
                if (length < 4 || length > 128) {
                    return helpers.error('Password length must be between 4 and 128');
                }

                const password = generatePassword(length);
                return `🔐 **Generated Password**\n\n\`${password}\`\n\n_Length: ${length} characters_`;
            },
        },
    },

    tools: {
        generatePassword: {
            description: 'Generate a secure random password',
            parameters: {
                length: {
                    type: 'number',
                    description: 'Password length (default: 16, max: 128)',
                    required: false,
                },
                includeUppercase: {
                    type: 'boolean',
                    description: 'Include uppercase letters (default: true)',
                    required: false,
                },
                includeLowercase: {
                    type: 'boolean',
                    description: 'Include lowercase letters (default: true)',
                    required: false,
                },
                includeNumbers: {
                    type: 'boolean',
                    description: 'Include numbers (default: true)',
                    required: false,
                },
                includeSymbols: {
                    type: 'boolean',
                    description: 'Include symbols (default: true)',
                    required: false,
                },
            },
            execute: async (params) => {
                const length = params.length || 16;
                
                if (length < 4 || length > 128) {
                    return { success: false, error: 'Password length must be between 4 and 128' };
                }

                const password = generatePassword(length, {
                    includeUppercase: params.includeUppercase !== false,
                    includeLowercase: params.includeLowercase !== false,
                    includeNumbers: params.includeNumbers !== false,
                    includeSymbols: params.includeSymbols !== false,
                });

                return {
                    success: true,
                    password,
                    length: password.length,
                };
            },
        },
    },
});

