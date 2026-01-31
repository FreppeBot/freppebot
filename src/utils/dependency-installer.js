/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                  DEPENDENCY INSTALLER                          ║
 * ║         Auto-installs missing system dependencies              ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const logger = require('./logger');

const execAsync = promisify(exec);

// Dependency definitions with installation commands
const DEPENDENCIES = {
    'yt-dlp': {
        check: 'yt-dlp --version',
        install: {
            windows: 'pip install yt-dlp',
            linux: 'pip3 install yt-dlp || pip install yt-dlp',
            darwin: 'pip3 install yt-dlp || pip install yt-dlp',
        },
        fallback: 'youtube-dl',
        fallbackCheck: 'youtube-dl --version',
    },
    'youtube-dl': {
        check: 'youtube-dl --version',
        install: {
            windows: 'pip install youtube-dl',
            linux: 'pip3 install youtube-dl || pip install youtube-dl',
            darwin: 'pip3 install youtube-dl || pip install youtube-dl',
        },
    },
    'ffmpeg': {
        check: 'ffmpeg -version',
        install: {
            windows: 'choco install ffmpeg -y || winget install ffmpeg || echo "Please install ffmpeg manually from https://ffmpeg.org/download.html"',
            linux: 'sudo apt-get update && sudo apt-get install -y ffmpeg || sudo yum install -y ffmpeg || sudo pacman -S ffmpeg',
            darwin: 'brew install ffmpeg || echo "Please install ffmpeg: brew install ffmpeg"',
        },
    },
    'ffprobe': {
        check: 'ffprobe -version',
        install: {
            windows: 'choco install ffmpeg -y || winget install ffmpeg || echo "ffprobe comes with ffmpeg"',
            linux: 'sudo apt-get update && sudo apt-get install -y ffmpeg || sudo yum install -y ffmpeg || sudo pacman -S ffmpeg',
            darwin: 'brew install ffmpeg || echo "ffprobe comes with ffmpeg"',
        },
    },
};

/**
 * Check if a dependency is installed
 */
async function checkDependency(name) {
    const dep = DEPENDENCIES[name];
    if (!dep) {
        return { installed: false, error: `Unknown dependency: ${name}` };
    }

    try {
        const { stdout } = await execAsync(dep.check, { timeout: 5000 });
        return { installed: true, version: stdout.trim() };
    } catch (error) {
        // Check for fallback
        if (dep.fallback) {
            try {
                const fallbackDep = DEPENDENCIES[dep.fallback];
                const { stdout } = await execAsync(fallbackDep.check, { timeout: 5000 });
                return { installed: true, version: stdout.trim(), usingFallback: dep.fallback };
            } catch {}
        }
        return { installed: false };
    }
}

/**
 * Get platform-specific install command
 */
function getInstallCommand(name) {
    const dep = DEPENDENCIES[name];
    if (!dep) return null;

    const platform = process.platform;
    const installCmd = dep.install[platform] || dep.install.linux || dep.install.windows;
    return installCmd;
}

/**
 * Attempt to install a dependency
 */
async function installDependency(name, ctx = null) {
    const dep = DEPENDENCIES[name];
    if (!dep) {
        return { success: false, error: `Unknown dependency: ${name}` };
    }

    const installCmd = getInstallCommand(name);
    if (!installCmd) {
        return { success: false, error: `No install command for ${name} on ${process.platform}` };
    }

    logger.info(`🔧 Attempting to install ${name}...`);
    
    try {
        // Try to install
        const { stdout, stderr } = await execAsync(installCmd, { 
            timeout: 120000, // 2 minutes
            maxBuffer: 1024 * 1024 * 10, // 10MB
        });
        
        // Verify installation
        const check = await checkDependency(name);
        if (check.installed) {
            logger.info(`✅ Successfully installed ${name}${check.usingFallback ? ` (using ${check.usingFallback})` : ''}`);
            return { 
                success: true, 
                message: `Installed ${name}${check.usingFallback ? ` (using ${check.usingFallback})` : ''}`,
                output: stdout 
            };
        } else {
            // Installation might have succeeded but command not in PATH
            logger.warn(`⚠️ ${name} installation completed but not found in PATH`);
            return { 
                success: false, 
                error: `${name} installed but not in PATH. Please restart terminal or add to PATH.`,
                output: stdout 
            };
        }
    } catch (error) {
        logger.error(`❌ Failed to install ${name}: ${error.message}`);
        
        // Try AI-assisted troubleshooting if context is available
        if (ctx && ctx.getAI) {
            try {
                const aiSolution = await getAISolution(name, error.message, installCmd, ctx);
                return {
                    success: false,
                    error: `Installation failed. ${aiSolution}`,
                    aiSolution
                };
            } catch (aiError) {
                logger.error(`AI troubleshooting failed: ${aiError.message}`);
            }
        }
        
        return { 
            success: false, 
            error: `Failed to install ${name}: ${error.message}. Install manually: ${installCmd}`,
            stderr: error.stderr || error.message
        };
    }
}

/**
 * Use AI to suggest solutions for installation failures
 */
async function getAISolution(dependencyName, errorMessage, installCommand, ctx) {
    try {
        // Try to get AI from context
        let ai = null;
        if (ctx && ctx.getAI) {
            ai = ctx.getAI();
        } else if (ctx && ctx.bot && ctx.bot.getAI) {
            ai = ctx.bot.getAI();
        }
        
        if (!ai) return null;

        const prompt = `A user is trying to install ${dependencyName} on ${process.platform} using: ${installCommand}

Error: ${errorMessage}

Provide a brief, actionable solution (1-2 sentences). Focus on:
1. Common causes (permissions, package manager not installed, PATH issues)
2. Alternative installation methods
3. Manual installation steps if needed

Be concise and practical.`;

        const response = await ai.chat({
            messages: [
                { role: 'system', content: 'You are a helpful system administrator assistant. Provide concise, actionable solutions.' },
                { role: 'user', content: prompt }
            ],
            tools: [],
        });

        return response.content || null;
    } catch (error) {
        logger.error(`AI solution generation failed: ${error.message}`);
        return null;
    }
}

/**
 * Check and install dependency if missing
 */
async function ensureDependency(name, ctx = null, autoInstall = true) {
    const check = await checkDependency(name);
    
    if (check.installed) {
        return { 
            installed: true, 
            version: check.version,
            usingFallback: check.usingFallback 
        };
    }

    if (!autoInstall) {
        return { 
            installed: false, 
            error: `${name} not found. Install manually: ${getInstallCommand(name) || 'See documentation'}` 
        };
    }

    // Try to install
    logger.info(`📦 ${name} not found, attempting auto-install...`);
    const installResult = await installDependency(name, ctx);
    
    if (installResult.success) {
        // Verify it's now available
        const verify = await checkDependency(name);
        return {
            installed: verify.installed,
            version: verify.version,
            usingFallback: verify.usingFallback,
            justInstalled: true
        };
    } else {
        return {
            installed: false,
            error: installResult.error,
            aiSolution: installResult.aiSolution
        };
    }
}

module.exports = {
    checkDependency,
    installDependency,
    ensureDependency,
    getInstallCommand,
    DEPENDENCIES,
};

