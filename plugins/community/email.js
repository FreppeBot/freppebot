/**
 * 📧 EMAIL PLUGIN
 * 
 * Send emails via SMTP (works with Gmail, Outlook, etc.)
 * 
 * Setup in config.json under plugins.email:
 * {
 *   "smtp": {
 *     "host": "smtp.gmail.com",
 *     "port": 587,
 *     "user": "your@email.com",
 *     "password": "your-app-password"
 *   },
 *   "fromName": "FreppeBot"
 * }
 * 
 * For Gmail: Use an App Password, not your regular password
 * https://myaccount.google.com/apppasswords
 * 
 * Commands: !email <to> <subject> | <body>
 * AI Tools: sendEmail
 */

const { Plugin, helpers } = require('../../src/plugins/sdk');
const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter(config) {
    if (transporter) return transporter;

    const smtp = config?.smtp;
    if (!smtp?.host || !smtp?.user || !smtp?.password) {
        throw new Error('Email not configured. Add SMTP settings to config.json');
    }

    transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port || 587,
        secure: smtp.port === 465,
        auth: {
            user: smtp.user,
            pass: smtp.password,
        },
    });

    return transporter;
}

module.exports = new Plugin({
    name: 'email',
    description: 'Send emails via SMTP',
    version: '1.0.0',
    requiresAdmin: true, // Only admins can send emails

    commands: {
        email: {
            description: 'Send email: !email to@example.com Subject | Body text',
            handler: async (ctx, args) => {
                if (!ctx.isAdmin) {
                    return '❌ Only admins can send emails';
                }

                if (args.length < 2) {
                    return '📧 Usage: !email to@example.com Subject here | Body text here';
                }

                const to = args[0];
                const rest = args.slice(1).join(' ');
                const [subject, ...bodyParts] = rest.split('|');
                const body = bodyParts.join('|').trim() || 'Sent from FreppeBot';

                if (!subject) {
                    return '📧 Please include a subject';
                }

                try {
                    const config = ctx.bot.getConfig().plugins?.email;
                    const transport = getTransporter(config);

                    await transport.sendMail({
                        from: `"${config?.fromName || 'FreppeBot'}" <${config?.smtp?.user}>`,
                        to,
                        subject: subject.trim(),
                        text: body,
                    });

                    return `📧 Email sent to ${to}`;
                } catch (error) {
                    return `❌ Failed to send: ${error.message}`;
                }
            },
        },
    },

    tools: {
        sendEmail: {
            description: 'Send an email to someone',
            parameters: {
                to: {
                    type: 'string',
                    description: 'Recipient email address',
                },
                subject: {
                    type: 'string',
                    description: 'Email subject',
                },
                body: {
                    type: 'string',
                    description: 'Email body text',
                },
            },
            execute: async (params, ctx) => {
                if (!ctx.isAdmin) {
                    return { error: 'Only admins can send emails' };
                }

                try {
                    const config = ctx.bot.getConfig().plugins?.email;
                    const transport = getTransporter(config);

                    const info = await transport.sendMail({
                        from: `"${config?.fromName || 'FreppeBot'}" <${config?.smtp?.user}>`,
                        to: params.to,
                        subject: params.subject,
                        text: params.body,
                    });

                    return {
                        success: true,
                        messageId: info.messageId,
                        to: params.to,
                    };
                } catch (error) {
                    return { error: error.message };
                }
            },
        },
    },
});
