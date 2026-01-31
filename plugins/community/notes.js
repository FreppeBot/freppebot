/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     NOTES PLUGIN                               ║
 * ║                                                                 ║
 * ║   Quick note-taking and organization                           ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const { Plugin, helpers } = require('../../src/plugins/sdk');

module.exports = new Plugin({
    name: 'notes',
    description: 'Take and manage notes',
    version: '1.0.0',
    author: 'FreppeBot',

    commands: {
        note: {
            description: 'Save a note: !note <title> | <content>',
            handler: async (ctx, args) => {
                if (args.length < 2) {
                    return helpers.error('Usage: !note <title> | <content>\nExample: !note Shopping | Buy milk and eggs');
                }

                const input = args.join(' ');
                const parts = input.split('|');
                
                if (parts.length < 2) {
                    return helpers.error('Use | to separate title and content\nExample: !note Shopping | Buy milk and eggs');
                }

                const title = parts[0].trim();
                const content = parts.slice(1).join('|').trim();

                const db = ctx.getDatabase();
                const notes = db.getPluginData('notes', ctx.getUserId()) || [];
                notes.push({
                    title,
                    content,
                    createdAt: new Date().toISOString(),
                });

                db.setPluginData('notes', ctx.getUserId(), notes);

                return helpers.success(`Note saved: "${title}"`);
            },
        },

        notes: {
            description: 'List all your notes',
            handler: async (ctx) => {
                const db = ctx.getDatabase();
                const notes = db.getPluginData('notes', ctx.getUserId()) || [];

                if (notes.length === 0) {
                    return helpers.info('You have no notes');
                }

                let msg = `📝 **Your Notes (${notes.length})**\n\n`;
                notes.forEach((note, i) => {
                    const date = new Date(note.createdAt).toLocaleDateString();
                    msg += `${i + 1}. **${note.title}** (${date})\n`;
                    msg += `   ${note.content.substring(0, 50)}${note.content.length > 50 ? '...' : ''}\n\n`;
                });

                return msg;
            },
        },

        readnote: {
            description: 'Read a specific note: !readnote <number>',
            handler: async (ctx, args) => {
                if (!args[0]) {
                    return helpers.error('Usage: !readnote <number>');
                }

                const index = parseInt(args[0]) - 1;
                const db = ctx.getDatabase();
                const notes = db.getPluginData('notes', ctx.getUserId()) || [];

                if (index < 0 || index >= notes.length) {
                    return helpers.error(`Note ${args[0]} not found`);
                }

                const note = notes[index];
                const date = new Date(note.createdAt).toLocaleString();

                return `📝 **${note.title}**\n_${date}_\n\n${note.content}`;
            },
        },

        deletenote: {
            description: 'Delete a note: !deletenote <number>',
            handler: async (ctx, args) => {
                if (!args[0]) {
                    return helpers.error('Usage: !deletenote <number>');
                }

                const index = parseInt(args[0]) - 1;
                const db = ctx.getDatabase();
                const notes = db.getPluginData('notes', ctx.getUserId()) || [];

                if (index < 0 || index >= notes.length) {
                    return helpers.error(`Note ${args[0]} not found`);
                }

                const deleted = notes.splice(index, 1)[0];
                db.setPluginData('notes', ctx.getUserId(), notes);

                return helpers.success(`Deleted note: "${deleted.title}"`);
            },
        },
    },

    tools: {
        saveNote: {
            description: 'Save a note for the user',
            parameters: {
                title: {
                    type: 'string',
                    description: 'Note title',
                },
                content: {
                    type: 'string',
                    description: 'Note content',
                },
            },
            execute: async (params, ctx) => {
                const db = ctx.getDatabase();
                const notes = db.getPluginData('notes', ctx.getUserId()) || [];
                notes.push({
                    title: params.title,
                    content: params.content,
                    createdAt: new Date().toISOString(),
                });

                db.setPluginData('notes', ctx.getUserId(), notes);

                return {
                    success: true,
                    message: `Note "${params.title}" saved`,
                };
            },
        },

        listNotes: {
            description: 'List all notes for the user',
            parameters: {},
            execute: async (params, ctx) => {
                const db = ctx.getDatabase();
                const notes = db.getPluginData('notes', ctx.getUserId()) || [];

                return {
                    count: notes.length,
                    notes: notes.map((note, i) => ({
                        index: i + 1,
                        title: note.title,
                        content: note.content,
                        createdAt: note.createdAt,
                    })),
                };
            },
        },
    },
});

