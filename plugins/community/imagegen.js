/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     IMAGE GENERATION PLUGIN                    ║
 * ║                                                                 ║
 * ║   Generate images using OpenAI DALL-E or other providers      ║
 * ╚═══════════════════════════════════════════════════════════════╝
 * 
 * The AI can chain this with other plugins! For example:
 * - Generate an image, then tweet it
 * - Create a meme, save to files
 * - Generate art based on user request
 */

const { Plugin, helpers } = require('../../src/plugins/sdk');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

module.exports = new Plugin({
    name: 'imagegen',
    description: 'Generate images using AI (DALL-E, Stable Diffusion)',
    version: '1.0.0',
    author: 'FreppeBot',

    commands: {
        imagine: {
            description: 'Generate an image: !imagine <prompt>',
            handler: async (ctx, args) => {
                if (args.length === 0) {
                    return helpers.error('Usage: !imagine <description of image>');
                }

                const prompt = args.join(' ');

                try {
                    await ctx.reply('🎨 Generating image...');
                    await ctx.sendTyping();

                    const result = await generateImage(prompt, {}, ctx);

                    if (result.success) {
                        return `🖼️ **Generated Image**\n\n${result.url}\n\n_Prompt: "${helpers.truncate(prompt, 100)}"_`;
                    } else {
                        return helpers.error(result.error);
                    }
                } catch (error) {
                    return helpers.error(`Image generation failed: ${error.message}`);
                }
            },
        },
    },

    tools: {
        generateImage: {
            description: 'Generate an image from a text description using DALL-E',
            parameters: {
                prompt: {
                    type: 'string',
                    description: 'Detailed description of the image to generate',
                },
                size: {
                    type: 'string',
                    description: 'Image size',
                    enum: ['1024x1024', '1792x1024', '1024x1792'],
                    required: false,
                },
                style: {
                    type: 'string',
                    description: 'Image style',
                    enum: ['vivid', 'natural'],
                    required: false,
                },
            },
            execute: async (params, ctx) => {
                return generateImage(params.prompt, {
                    size: params.size || '1024x1024',
                    style: params.style || 'vivid',
                }, ctx);
            },
        },

        generateAndSaveImage: {
            description: 'Generate an image and save it to a file',
            parameters: {
                prompt: {
                    type: 'string',
                    description: 'Description of the image to generate',
                },
                filename: {
                    type: 'string',
                    description: 'Filename to save as (without extension)',
                },
            },
            execute: async (params, ctx) => {
                const result = await generateImage(params.prompt, {}, ctx);

                if (!result.success) {
                    return result;
                }

                try {
                    // Download the image
                    const response = await fetch(result.url);
                    const buffer = await response.buffer();

                    // Save to data directory
                    const filepath = path.join(process.cwd(), 'data', `${params.filename}.png`);
                    await fs.writeFile(filepath, buffer);

                    return {
                        success: true,
                        url: result.url,
                        savedTo: filepath,
                    };
                } catch (error) {
                    return { success: false, error: `Failed to save: ${error.message}` };
                }
            },
        },

        editImage: {
            description: 'Edit an existing image with a prompt (requires image URL)',
            parameters: {
                imageUrl: {
                    type: 'string',
                    description: 'URL of the image to edit',
                },
                prompt: {
                    type: 'string',
                    description: 'Description of the edit to make',
                },
            },
            execute: async (params, ctx) => {
                // Note: DALL-E image editing requires specific format
                // This is a simplified example
                const apiKey = getOpenAIKey(ctx);

                if (!apiKey) {
                    return { success: false, error: 'OpenAI API key not configured' };
                }

                try {
                    // For image editing, you'd need to download the image first
                    // and send it as form data - this is a simplified example
                    return {
                        success: false,
                        error: 'Image editing requires local image file - use generateImage instead',
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },
    },
});

// Get OpenAI API key from config or environment
function getOpenAIKey(ctx) {
    // Try config.json first
    if (ctx?.bot) {
        const config = ctx.bot.getConfig();
        if (config?.ai?.openaiKey) {
            return { key: config.ai.openaiKey, isOpenRouter: false };
        }
        if (config?.ai?.openrouterKey) {
            return { key: config.ai.openrouterKey, isOpenRouter: true };
        }
    }
    
    // Fallback to environment variables
    if (process.env.OPENROUTER_API_KEY) {
        return { key: process.env.OPENROUTER_API_KEY, isOpenRouter: true };
    }
    if (process.env.OPENAI_API_KEY) {
        return { key: process.env.OPENAI_API_KEY, isOpenRouter: false };
    }
    return null;
}

// Generate image using DALL-E
async function generateImage(prompt, options = {}, ctx = null) {
    const keyInfo = getOpenAIKey(ctx);

    if (!keyInfo) {
        return {
            success: false,
            error: 'No OpenAI API key configured. Add openaiKey to config.json under ai section'
        };
    }

    const { size = '1024x1024', style = 'vivid' } = options;

    try {
        // Use OpenAI directly
        const response = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${keyInfo.key}`,
            },
            body: JSON.stringify({
                model: 'dall-e-3',
                prompt,
                n: 1,
                size,
                style,
                response_format: 'url',
            }),
        });

        const data = await response.json();

        if (data.error) {
            return { success: false, error: data.error.message };
        }

        return {
            success: true,
            url: data.data[0].url,
            revisedPrompt: data.data[0].revised_prompt,
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
}
