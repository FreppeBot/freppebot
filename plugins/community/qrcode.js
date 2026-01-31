/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     QR CODE PLUGIN                            ║
 * ║                                                                 ║
 * ║   Generate QR codes for text, URLs, and more                   ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const { Plugin, helpers } = require('../../src/plugins/sdk');
const fetch = require('node-fetch');

module.exports = new Plugin({
    name: 'qrcode',
    description: 'Generate QR codes',
    version: '1.0.0',
    author: 'FreppeBot',

    commands: {
        qr: {
            description: 'Generate QR code: !qr <text or url>',
            handler: async (ctx, args) => {
                if (args.length === 0) {
                    return helpers.error('Usage: !qr <text or url>\nExample: !qr https://example.com');
                }

                const text = args.join(' ');
                const encoded = encodeURIComponent(text);
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encoded}`;

                return `📱 **QR Code Generated**\n\n${qrUrl}\n\n_Scan with your phone to read: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}_`;
            },
        },
    },

    tools: {
        generateQRCode: {
            description: 'Generate a QR code for text or URL',
            parameters: {
                text: {
                    type: 'string',
                    description: 'Text or URL to encode in QR code',
                },
            },
            execute: async (params) => {
                const encoded = encodeURIComponent(params.text);
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encoded}`;

                return {
                    success: true,
                    qrUrl,
                    text: params.text,
                };
            },
        },
    },
});

