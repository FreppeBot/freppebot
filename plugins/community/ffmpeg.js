/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     FFMPEG PLUGIN                              ║
 * ║                                                                 ║
 * ║   Download videos, clip them, and send them                    ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const { Plugin, helpers } = require('../../src/plugins/sdk');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { ensureDependency } = require('../../src/utils/dependency-installer');

const execAsync = promisify(exec);

// Helper to run shell commands safely
async function runCommand(command, timeout = 60000) {
    try {
        const { stdout, stderr } = await execAsync(command, {
            timeout,
            maxBuffer: 1024 * 1024 * 100, // 100MB buffer for video operations
            shell: true,
        });
        return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (error) {
        return {
            success: false,
            error: error.message,
            stdout: error.stdout?.trim() || '',
            stderr: error.stderr?.trim() || '',
        };
    }
}

// Helper to send video file through adapter
async function sendVideoFile(ctx, videoPath, caption = '') {
    const logger = require('../../src/utils/logger');
    const platform = ctx.getPlatform();
    const message = ctx.message;

    try {
        if (platform === 'telegram') {
            // Telegram: Use bot.telegram.sendVideo
            const bot = ctx.bot;
            const adapters = bot.adapters || [];
            const telegramAdapter = adapters.find(a => a.platform === 'telegram');
            if (telegramAdapter && telegramAdapter.bot) {
                const chatId = message.channelId || message.userId;
                await telegramAdapter.bot.telegram.sendVideo(chatId, {
                    source: videoPath,
                }, {
                    caption: caption || undefined,
                });
                logger.info(`✅ Video sent via Telegram to ${chatId}: ${videoPath}`);
                return true;
            } else {
                logger.error('Telegram adapter not found');
                return false;
            }
        } else if (platform === 'discord') {
            // Discord: Use AttachmentBuilder
            const { AttachmentBuilder } = require('discord.js');
            const attachment = new AttachmentBuilder(videoPath);
            const bot = ctx.bot;
            const adapters = bot.adapters || [];
            const discordAdapter = adapters.find(a => a.platform === 'discord');
            if (discordAdapter && discordAdapter.client) {
                const channelId = message.channelId;
                const channel = await discordAdapter.client.channels.fetch(channelId);
                if (channel) {
                    await channel.send({
                        content: caption || undefined,
                        files: [attachment],
                    });
                    logger.info(`✅ Video sent via Discord to channel ${channelId}: ${videoPath}`);
                    return true;
                } else {
                    logger.error(`Discord channel ${channelId} not found`);
                    return false;
                }
            } else {
                logger.error('Discord adapter not found');
                return false;
            }
        }
        
        logger.warn(`⚠️ Platform ${platform} doesn't support video sending`);
        return false;
    } catch (error) {
        logger.error(`❌ Failed to send video: ${error.message}`);
        logger.error(error.stack);
        return false;
    }
}

// Check if yt-dlp is installed (with auto-install)
async function checkYtDlp(ctx = null) {
    const result = await ensureDependency('yt-dlp', ctx, true);
    return result.installed;
}

// Check if ffmpeg is installed (with auto-install)
async function checkFfmpeg(ctx = null) {
    const result = await ensureDependency('ffmpeg', ctx, true);
    return result.installed;
}

module.exports = new Plugin({
    name: 'ffmpeg',
    description: 'Download videos, clip them, and send them',
    version: '1.0.0',
    author: 'FreppeBot',
    requiresAdmin: true,

    commands: {
        'video-download': {
            description: 'Download a video: !video-download <url>',
            handler: async (ctx, args) => {
                if (!ctx.isAdmin) {
                    return helpers.error('Admin only');
                }

                if (args.length === 0) {
                    return helpers.error('Usage: !video-download <url>');
                }

                const url = args[0];
                
                // Check and auto-install yt-dlp if needed
                const ytDlpCheck = await ensureDependency('yt-dlp', ctx, true);
                if (!ytDlpCheck.installed) {
                    const errorMsg = ytDlpCheck.error || 'yt-dlp not found';
                    const aiHelp = ytDlpCheck.aiSolution ? `\n\n💡 ${ytDlpCheck.aiSolution}` : '';
                    return helpers.error(`${errorMsg}${aiHelp}`);
                }

                try {
                    await ctx.reply('📥 Downloading video... This may take a while.');

                    // Create temp directory for downloads
                    const tempDir = path.join(process.cwd(), 'data', 'temp');
                    await fs.mkdir(tempDir, { recursive: true });

                    // Download video
                    const outputPath = path.join(tempDir, `video_${Date.now()}.%(ext)s`);
                    const result = await runCommand(`yt-dlp -o ${outputPath} "${url}"`, 300000); // 5 min timeout

                    if (!result.success) {
                        // Try with youtube-dl
                        const result2 = await runCommand(`youtube-dl -o ${outputPath} "${url}"`, 300000);
                        if (!result2.success) {
                            return helpers.error(`Download failed: ${result2.stderr || result2.error}`);
                        }
                    }

                    // Find the downloaded file
                    const files = await fs.readdir(tempDir);
                    const videoFile = files.find(f => f.startsWith('video_') && (f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mkv')));
                    
                    if (!videoFile) {
                        return helpers.error('Downloaded file not found');
                    }

                    const videoPath = path.join(tempDir, videoFile);
                    return `✅ Video downloaded: ${videoFile}\n📁 Location: ${videoPath}`;
                } catch (error) {
                    return helpers.error(`Error: ${error.message}`);
                }
            },
        },

        'video-clip': {
            description: 'Clip video from middle: !video-clip <file> <duration>',
            handler: async (ctx, args) => {
                if (!ctx.isAdmin) {
                    return helpers.error('Admin only');
                }

                if (args.length < 2) {
                    return helpers.error('Usage: !video-clip <file> <duration>\nExample: !video-clip video.mp4 30 (creates 30s clip from middle)');
                }

                // Check and auto-install ffmpeg if needed
                const ffmpegCheck = await ensureDependency('ffmpeg', ctx, true);
                if (!ffmpegCheck.installed) {
                    const errorMsg = ffmpegCheck.error || 'ffmpeg not found';
                    const aiHelp = ffmpegCheck.aiSolution ? `\n\n💡 ${ffmpegCheck.aiSolution}` : '';
                    return helpers.error(`${errorMsg}${aiHelp}`);
                }

                const filePath = args[0];
                const duration = parseFloat(args[1]);

                if (isNaN(duration) || duration <= 0) {
                    return helpers.error('Invalid duration. Must be a positive number (seconds)');
                }

                try {
                    await ctx.reply('✂️ Clipping video from middle...');

                    // Check if file exists
                    try {
                        await fs.access(filePath);
                    } catch {
                        return helpers.error(`File not found: ${filePath}`);
                    }

                    // Get video duration
                    const durationResult = await runCommand(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
                    if (!durationResult.success) {
                        return helpers.error('Failed to get video duration');
                    }

                    const totalDuration = parseFloat(durationResult.stdout);
                    if (totalDuration <= duration) {
                        return helpers.error(`Video is only ${totalDuration.toFixed(1)}s long. Cannot clip ${duration}s from middle.`);
                    }

                    // Calculate start time (middle of video)
                    const startTime = (totalDuration - duration) / 2;

                    // Create output file
                    const ext = path.extname(filePath);
                    const outputPath = filePath.replace(ext, `_clipped${ext}`);

                    // Clip video
                    const clipResult = await runCommand(
                        `ffmpeg -i "${filePath}" -ss ${startTime} -t ${duration} -c copy "${outputPath}"`,
                        120000 // 2 min timeout
                    );

                    if (!clipResult.success) {
                        // Try with re-encoding if copy fails
                        const clipResult2 = await runCommand(
                            `ffmpeg -i "${filePath}" -ss ${startTime} -t ${duration} -c:v libx264 -c:a aac "${outputPath}"`,
                            300000 // 5 min timeout
                        );
                        if (!clipResult2.success) {
                            return helpers.error(`Clipping failed: ${clipResult2.stderr || clipResult2.error}`);
                        }
                    }

                    return `✅ Video clipped: ${path.basename(outputPath)}\n📁 Location: ${outputPath}`;
                } catch (error) {
                    return helpers.error(`Error: ${error.message}`);
                }
            },
        },
    },

    tools: {
        downloadVideo: {
            description: 'Download a video from a URL (YouTube, etc.) using yt-dlp. This tool ONLY downloads the video to a local file. After downloading, you can use sendVideo tool to send it to the user, or use downloadAndClipVideo if they want a clipped version. DO NOT use shell commands for video downloads - use this tool instead.',
            parameters: {
                url: {
                    type: 'string',
                    description: 'URL of the video to download (e.g., YouTube URL)',
                },
            },
            execute: async (params, ctx) => {
                if (!ctx.isAdmin) {
                    return { success: false, error: 'Admin privileges required' };
                }

                const logger = require('../../src/utils/logger');
                logger.info(`[downloadVideo] Starting download from: ${params.url}`);
                
                // Check and auto-install yt-dlp if needed
                const ytDlpCheck = await ensureDependency('yt-dlp', ctx, true);
                if (!ytDlpCheck.installed) {
                    logger.error('[downloadVideo] yt-dlp not found and installation failed');
                    const errorMsg = ytDlpCheck.error || 'yt-dlp not found';
                    const aiHelp = ytDlpCheck.aiSolution ? `\n\n💡 ${ytDlpCheck.aiSolution}` : '';
                    return { success: false, error: `${errorMsg}${aiHelp}` };
                }
                logger.info(`[downloadVideo] yt-dlp available${ytDlpCheck.usingFallback ? ' (using youtube-dl)' : ''}`);

                try {
                    // Create temp directory for downloads
                    const tempDir = path.join(process.cwd(), 'data', 'temp');
                    await fs.mkdir(tempDir, { recursive: true });

                    // Download video
                    const outputPath = path.join(tempDir, `video_${Date.now()}.%(ext)s`);
                    logger.info(`[downloadVideo] Downloading to: ${outputPath}`);
                    
                    let result = await runCommand(`yt-dlp -o "${outputPath}" "${params.url}"`, 300000);
                    
                    if (!result.success) {
                        logger.warn(`[downloadVideo] yt-dlp failed, trying youtube-dl: ${result.stderr || result.error}`);
                        // Try with youtube-dl
                        result = await runCommand(`youtube-dl -o "${outputPath}" "${params.url}"`, 300000);
                        if (!result.success) {
                            logger.error(`[downloadVideo] Both yt-dlp and youtube-dl failed: ${result.stderr || result.error}`);
                            return { success: false, error: `Download failed: ${result.stderr || result.error}` };
                        }
                    }

                    logger.info(`[downloadVideo] Download command completed, stdout: ${result.stdout?.substring(0, 200)}`);

                    // Find the downloaded file
                    const files = await fs.readdir(tempDir);
                    logger.info(`[downloadVideo] Checking temp directory, found ${files.length} files`);
                    const videoFile = files.find(f => f.startsWith('video_') && (f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mkv') || f.endsWith('.m4a')));
                    
                    if (!videoFile) {
                        logger.error(`[downloadVideo] Video file not found. Files in temp: ${files.join(', ')}`);
                        return { success: false, error: 'Downloaded file not found. Check if yt-dlp completed successfully.' };
                    }

                    const videoPath = path.join(tempDir, videoFile);
                    const stats = await fs.stat(videoPath);
                    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

                    logger.info(`[downloadVideo] Success! File: ${videoFile}, Size: ${sizeMB}MB, Path: ${videoPath}`);

                    return {
                        success: true,
                        filePath: videoPath,
                        filename: videoFile,
                        sizeMB: parseFloat(sizeMB),
                        message: `✅ Video downloaded successfully: ${videoFile} (${sizeMB}MB). File saved to: ${videoPath}`,
                    };
                } catch (error) {
                    logger.error(`[downloadVideo] Exception: ${error.message}`, error.stack);
                    return { success: false, error: error.message };
                }
            },
        },

        clipVideoFromMiddle: {
            description: 'Clip a video from the middle (removes both ends), keeping the specified duration from the center',
            parameters: {
                filePath: {
                    type: 'string',
                    description: 'Path to the video file to clip',
                },
                duration: {
                    type: 'number',
                    description: 'Duration of the clip in seconds (e.g., 30 for 30 seconds)',
                },
            },
            execute: async (params, ctx) => {
                if (!ctx.isAdmin) {
                    return { success: false, error: 'Admin privileges required' };
                }

                const logger = require('../../src/utils/logger');
                
                // Check and auto-install ffmpeg if needed
                const ffmpegCheck = await ensureDependency('ffmpeg', ctx, true);
                if (!ffmpegCheck.installed) {
                    logger.error('[clipVideoFromMiddle] ffmpeg not found and installation failed');
                    const errorMsg = ffmpegCheck.error || 'ffmpeg not found';
                    const aiHelp = ffmpegCheck.aiSolution ? `\n\n💡 ${ffmpegCheck.aiSolution}` : '';
                    return { success: false, error: `${errorMsg}${aiHelp}` };
                }
                logger.info('[clipVideoFromMiddle] ffmpeg available');

                const filePath = params.filePath;
                const duration = params.duration;

                if (duration <= 0) {
                    return { success: false, error: 'Duration must be positive' };
                }

                try {
                    // Check if file exists
                    try {
                        await fs.access(filePath);
                    } catch {
                        return { success: false, error: `File not found: ${filePath}` };
                    }

                    // Get video duration
                    logger.info(`Getting video duration for: ${filePath}`);
                    const durationResult = await runCommand(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`);
                    if (!durationResult.success) {
                        return { success: false, error: 'Failed to get video duration. Make sure ffprobe is installed.' };
                    }

                    const totalDuration = parseFloat(durationResult.stdout);
                    if (totalDuration <= duration) {
                        return { success: false, error: `Video is only ${totalDuration.toFixed(1)}s long. Cannot clip ${duration}s from middle.` };
                    }

                    // Calculate start time (middle of video)
                    const startTime = (totalDuration - duration) / 2;
                    logger.info(`Clipping video: start=${startTime.toFixed(2)}s, duration=${duration}s (total: ${totalDuration.toFixed(2)}s)`);

                    // Create output file
                    const ext = path.extname(filePath);
                    const outputPath = filePath.replace(ext, `_clipped${ext}`);

                    // Clip video (try copy first, then re-encode if needed)
                    logger.info(`Clipping video to: ${outputPath}`);
                    let clipResult = await runCommand(
                        `ffmpeg -i "${filePath}" -ss ${startTime} -t ${duration} -c copy "${outputPath}"`,
                        120000
                    );

                    if (!clipResult.success) {
                        // Try with re-encoding if copy fails
                        logger.info('Copy codec failed, trying re-encode...');
                        clipResult = await runCommand(
                            `ffmpeg -i "${filePath}" -ss ${startTime} -t ${duration} -c:v libx264 -c:a aac "${outputPath}"`,
                            300000
                        );
                        if (!clipResult.success) {
                            return { success: false, error: `Clipping failed: ${clipResult.stderr || clipResult.error}` };
                        }
                    }

                    const stats = await fs.stat(outputPath);
                    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

                    return {
                        success: true,
                        filePath: outputPath,
                        filename: path.basename(outputPath),
                        sizeMB: parseFloat(sizeMB),
                        duration: duration,
                        message: `Video clipped: ${path.basename(outputPath)} (${sizeMB}MB, ${duration}s)`,
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },

        sendVideo: {
            description: 'Send a video file to the user via Telegram or Discord. Use this after downloading a video with downloadVideo tool. The file must be under 50MB for Telegram or 25MB for Discord.',
            parameters: {
                filePath: {
                    type: 'string',
                    description: 'Path to the video file to send (from downloadVideo tool result)',
                },
                caption: {
                    type: 'string',
                    description: 'Optional caption for the video',
                    required: false,
                },
            },
            execute: async (params, ctx) => {
                if (!ctx.isAdmin) {
                    return { success: false, error: 'Admin privileges required' };
                }

                const logger = require('../../src/utils/logger');
                const filePath = params.filePath;

                try {
                    // Check if file exists
                    try {
                        await fs.access(filePath);
                    } catch {
                        return { success: false, error: `File not found: ${filePath}` };
                    }

                    // Check file size (Telegram limit is 50MB, Discord is 25MB)
                    const stats = await fs.stat(filePath);
                    const sizeMB = stats.size / (1024 * 1024);
                    const platform = ctx.getPlatform();
                    const maxSize = platform === 'telegram' ? 50 : 25;

                    if (sizeMB > maxSize) {
                        return { success: false, error: `Video too large (${sizeMB.toFixed(2)}MB). Max size for ${platform} is ${maxSize}MB.` };
                    }

                    // Send video
                    logger.info(`Sending video: ${filePath} (${sizeMB.toFixed(2)}MB)`);
                    const sent = await sendVideoFile(ctx, filePath, params.caption);

                    if (sent) {
                        return {
                            success: true,
                            message: `Video sent successfully`,
                            sizeMB: sizeMB.toFixed(2),
                        };
                    } else {
                        return { success: false, error: 'Failed to send video' };
                    }
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },

        downloadAndClipVideo: {
            description: 'Download a video from a URL, clip a section from the middle, and automatically send it to the user. This is the best tool to use when the user asks to download a video and clip it, or just download and send a video. DO NOT use shell commands - use this tool instead.',
            parameters: {
                url: {
                    type: 'string',
                    description: 'URL of the video to download',
                },
                duration: {
                    type: 'number',
                    description: 'Duration of the clip in seconds (e.g., 30 for 30 seconds from middle)',
                },
                caption: {
                    type: 'string',
                    description: 'Optional caption for the video',
                    required: false,
                },
            },
            execute: async (params, ctx) => {
                if (!ctx.isAdmin) {
                    return { success: false, error: 'Admin privileges required' };
                }

                const logger = require('../../src/utils/logger');
                let downloadedFilePath = null;
                let clippedFilePath = null;
                
                try {
                    // Step 1: Download video (reuse downloadVideo logic)
                    logger.info(`Step 1: Downloading video from ${params.url}`);
                    const ytDlpCheck = await ensureDependency('yt-dlp', ctx, true);
                    if (!ytDlpCheck.installed) {
                        const errorMsg = ytDlpCheck.error || 'yt-dlp not found';
                        const aiHelp = ytDlpCheck.aiSolution ? `\n\n💡 ${ytDlpCheck.aiSolution}` : '';
                        return { success: false, error: `${errorMsg}${aiHelp}` };
                    }

                    const tempDir = path.join(process.cwd(), 'data', 'temp');
                    await fs.mkdir(tempDir, { recursive: true });
                    const outputPath = path.join(tempDir, `video_${Date.now()}.%(ext)s`);
                    
                    let result = await runCommand(`yt-dlp -o "${outputPath}" "${params.url}"`, 300000);
                    if (!result.success) {
                        result = await runCommand(`youtube-dl -o "${outputPath}" "${params.url}"`, 300000);
                        if (!result.success) {
                            return { success: false, error: `Download failed: ${result.stderr || result.error}` };
                        }
                    }

                    const files = await fs.readdir(tempDir);
                    const videoFile = files.find(f => f.startsWith('video_') && (f.endsWith('.mp4') || f.endsWith('.webm') || f.endsWith('.mkv') || f.endsWith('.m4a')));
                    if (!videoFile) {
                        return { success: false, error: 'Downloaded file not found' };
                    }

                    downloadedFilePath = path.join(tempDir, videoFile);

                    // Step 2: Clip video from middle (reuse clipVideoFromMiddle logic)
                    logger.info(`Step 2: Clipping ${params.duration}s from middle`);
                    const ffmpegCheck = await ensureDependency('ffmpeg', ctx, true);
                    if (!ffmpegCheck.installed) {
                        const errorMsg = ffmpegCheck.error || 'ffmpeg not found';
                        const aiHelp = ffmpegCheck.aiSolution ? `\n\n💡 ${ffmpegCheck.aiSolution}` : '';
                        return { success: false, error: `${errorMsg}${aiHelp}` };
                    }

                    const durationResult = await runCommand(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${downloadedFilePath}"`);
                    if (!durationResult.success) {
                        return { success: false, error: 'Failed to get video duration' };
                    }

                    const totalDuration = parseFloat(durationResult.stdout);
                    if (totalDuration <= params.duration) {
                        return { success: false, error: `Video is only ${totalDuration.toFixed(1)}s long. Cannot clip ${params.duration}s from middle.` };
                    }

                    const startTime = (totalDuration - params.duration) / 2;
                    const ext = path.extname(downloadedFilePath);
                    clippedFilePath = downloadedFilePath.replace(ext, `_clipped${ext}`);

                    let clipResult = await runCommand(
                        `ffmpeg -i "${downloadedFilePath}" -ss ${startTime} -t ${params.duration} -c copy "${clippedFilePath}"`,
                        120000
                    );

                    if (!clipResult.success) {
                        clipResult = await runCommand(
                            `ffmpeg -i "${downloadedFilePath}" -ss ${startTime} -t ${params.duration} -c:v libx264 -c:a aac "${clippedFilePath}"`,
                            300000
                        );
                        if (!clipResult.success) {
                            return { success: false, error: `Clipping failed: ${clipResult.stderr || clipResult.error}` };
                        }
                    }

                    // Step 3: Send video
                    logger.info(`Step 3: Sending clipped video`);
                    const sent = await sendVideoFile(ctx, clippedFilePath, params.caption);

                    // Clean up original downloaded file
                    try {
                        await fs.unlink(downloadedFilePath);
                    } catch {}

                    if (sent) {
                        return {
                            success: true,
                            message: `Video downloaded, clipped, and sent successfully`,
                            clippedFile: path.basename(clippedFilePath),
                            duration: params.duration,
                        };
                    } else {
                        return { success: false, error: 'Failed to send video' };
                    }
                } catch (error) {
                    // Clean up on error
                    try {
                        if (downloadedFilePath) await fs.unlink(downloadedFilePath);
                        if (clippedFilePath) await fs.unlink(clippedFilePath);
                    } catch {}
                    return { success: false, error: error.message };
                }
            },
        },
    },
});

