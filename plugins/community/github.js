/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     GITHUB PLUGIN                              ║
 * ║                                                                 ║
 * ║   Interact with GitHub - search repos, create repos, git ops   ║
 * ╚═══════════════════════════════════════════════════════════════╝
 */

const { Plugin, helpers } = require('../../src/plugins/sdk');
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Helper to escape shell arguments
function escapeShellArg(arg) {
    if (typeof arg !== 'string') return arg;
    // Escape single quotes and wrap in single quotes
    return `'${arg.replace(/'/g, "'\\''")}'`;
}

// Helper to run git commands safely
async function runGitCommand(command, cwd, timeout = 30000) {
    try {
        const { stdout, stderr } = await execAsync(command, {
            cwd,
            timeout,
            maxBuffer: 1024 * 1024,
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

// Check if git is configured
async function ensureGitConfig(cwd) {
    const nameCheck = await runGitCommand('git config user.name', cwd);
    const emailCheck = await runGitCommand('git config user.email', cwd);
    
    if (!nameCheck.success || !nameCheck.stdout) {
        await runGitCommand('git config user.name "FreppeBot"', cwd);
    }
    if (!emailCheck.success || !emailCheck.stdout) {
        await runGitCommand('git config user.email "freppebot@localhost"', cwd);
    }
}

// Get GitHub API token from config
function getGitHubToken(ctx) {
    const config = ctx.bot.getConfig();
    return config?.plugins?.github?.token || process.env.GITHUB_TOKEN;
}

module.exports = new Plugin({
    name: 'github',
    description: 'Search GitHub repositories and get repository information',
    version: '1.0.0',
    author: 'FreppeBot',

    commands: {
        github: {
            description: 'Search GitHub: !github <query>',
            handler: async (ctx, args) => {
                if (args.length === 0) {
                    return helpers.error('Usage: !github <search query>\nExample: !github discord bot');
                }

                const query = args.join(' ');
                try {
                    const response = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&per_page=5`);
                    const data = await response.json();

                    if (!response.ok) {
                        throw new Error(data.message || 'GitHub API error');
                    }

                    if (data.items.length === 0) {
                        return helpers.info('No repositories found');
                    }

                    let msg = `🔍 **GitHub Search: "${query}"**\n\n`;
                    data.items.forEach((repo, i) => {
                        msg += `${i + 1}. **${repo.full_name}** ⭐ ${repo.stargazers_count}\n`;
                        msg += `   ${repo.description || 'No description'}\n`;
                        msg += `   ${repo.html_url}\n\n`;
                    });

                    return msg;
                } catch (error) {
                    return helpers.error(`GitHub search failed: ${error.message}`);
                }
            },
        },

        'github-init': {
            description: 'Initialize git repo: !github-init <folder>',
            handler: async (ctx, args) => {
                if (!ctx.isAdmin) {
                    return helpers.error('Admin only');
                }

                const folder = args[0] || process.cwd();
                const fullPath = path.resolve(folder);

                try {
                    // Check if already a git repo
                    const checkResult = await runGitCommand('git rev-parse --git-dir', fullPath);
                    if (checkResult.success) {
                        return helpers.info('Already a git repository');
                    }

                    // Initialize
                    const result = await runGitCommand('git init', fullPath);
                    if (result.success) {
                        return `✅ Git repository initialized in ${fullPath}`;
                    } else {
                        return helpers.error(`Failed: ${result.error}`);
                    }
                } catch (error) {
                    return helpers.error(`Error: ${error.message}`);
                }
            },
        },

        'github-commit': {
            description: 'Commit changes: !github-commit <message> [folder]',
            handler: async (ctx, args) => {
                if (!ctx.isAdmin) {
                    return helpers.error('Admin only');
                }

                if (args.length === 0) {
                    return helpers.error('Usage: !github-commit <message> [folder]');
                }

                const message = args[0];
                const folder = args[1] || process.cwd();
                const fullPath = path.resolve(folder);

                try {
                    // Add all files
                    const addResult = await runGitCommand('git add .', fullPath);
                    if (!addResult.success && !addResult.stderr.includes('nothing to commit')) {
                        return helpers.error(`git add failed: ${addResult.error}`);
                    }

                    // Ensure git config is set
                    await ensureGitConfig(fullPath);

                    // Commit with properly escaped message
                    const commitResult = await runGitCommand(`git commit -m ${escapeShellArg(message)}`, fullPath);
                    if (commitResult.success) {
                        return `✅ Committed: ${message}`;
                    } else if (commitResult.stderr.includes('nothing to commit') || commitResult.stderr.includes('no changes')) {
                        return helpers.info('Nothing to commit');
                    } else {
                        return helpers.error(`Commit failed: ${commitResult.stderr || commitResult.error}`);
                    }
                } catch (error) {
                    return helpers.error(`Error: ${error.message}`);
                }
            },
        },

        'github-push': {
            description: 'Push to GitHub: !github-push [remote] [branch] [folder]',
            handler: async (ctx, args) => {
                if (!ctx.isAdmin) {
                    return helpers.error('Admin only');
                }

                const remote = args[0] || 'origin';
                const branch = args[1] || 'main';
                const folder = args[2] || process.cwd();
                const fullPath = path.resolve(folder);

                try {
                    // Validate branch name
                    if (!/^[a-zA-Z0-9._/-]+$/.test(branch)) {
                        return helpers.error('Invalid branch name');
                    }

                    // Check if remote exists
                    const remoteCheck = await runGitCommand(`git remote get-url ${escapeShellArg(remote)}`, fullPath);
                    if (!remoteCheck.success) {
                        return helpers.error(`Remote "${remote}" not found. Use github-create-repo first or add remote manually.`);
                    }

                    // Check if branch exists, create if needed
                    const branchCheck = await runGitCommand(`git rev-parse --verify ${escapeShellArg(branch)}`, fullPath);
                    if (!branchCheck.success) {
                        await runGitCommand(`git checkout -b ${escapeShellArg(branch)}`, fullPath);
                    }

                    // Push
                    const pushResult = await runGitCommand(`git push -u ${escapeShellArg(remote)} ${escapeShellArg(branch)}`, fullPath);
                    if (pushResult.success) {
                        return `✅ Pushed to ${remote}/${branch}`;
                    } else {
                        return helpers.error(`Push failed: ${pushResult.stderr || pushResult.error}`);
                    }
                } catch (error) {
                    return helpers.error(`Error: ${error.message}`);
                }
            },
        },
    },

    tools: {
        searchGitHub: {
            description: 'Search GitHub repositories',
            parameters: {
                query: {
                    type: 'string',
                    description: 'Search query',
                },
            },
            execute: async (params) => {
                try {
                    const response = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(params.query)}&sort=stars&per_page=5`);
                    const data = await response.json();

                    if (!response.ok) {
                        return { success: false, error: data.message || 'GitHub API error' };
                    }

                    return {
                        success: true,
                        count: data.total_count,
                        repositories: data.items.map(repo => ({
                            name: repo.full_name,
                            description: repo.description,
                            stars: repo.stargazers_count,
                            url: repo.html_url,
                            language: repo.language,
                        })),
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },

        createFolder: {
            description: 'Create a folder/directory',
            parameters: {
                folderPath: {
                    type: 'string',
                    description: 'Path to the folder to create',
                },
            },
            execute: async (params, ctx) => {
                if (!ctx.isAdmin) {
                    return { success: false, error: 'Admin privileges required' };
                }

                try {
                    const fullPath = path.resolve(params.folderPath);
                    
                    // Basic path validation - ensure it's within reasonable bounds
                    if (fullPath.length > 500) {
                        return { success: false, error: 'Path too long' };
                    }
                    
                    await fs.mkdir(fullPath, { recursive: true });
                    return { success: true, path: fullPath };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },

        createFile: {
            description: 'Create a file with content',
            parameters: {
                filePath: {
                    type: 'string',
                    description: 'Path to the file to create',
                },
                content: {
                    type: 'string',
                    description: 'Content to write to the file',
                },
            },
            execute: async (params, ctx) => {
                if (!ctx.isAdmin) {
                    return { success: false, error: 'Admin privileges required' };
                }

                try {
                    const fullPath = path.resolve(params.filePath);
                    
                    // Basic path validation
                    if (fullPath.length > 500) {
                        return { success: false, error: 'Path too long' };
                    }
                    
                    const dir = path.dirname(fullPath);
                    
                    // Create directory if it doesn't exist
                    await fs.mkdir(dir, { recursive: true });
                    
                    // Write file
                    await fs.writeFile(fullPath, params.content || '', 'utf-8');
                    return { success: true, path: fullPath };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },

        initializeGitRepository: {
            description: 'Initialize a git repository in a folder',
            parameters: {
                folderPath: {
                    type: 'string',
                    description: 'Path to the folder where to initialize git',
                    required: false,
                },
            },
            execute: async (params, ctx) => {
                if (!ctx.isAdmin) {
                    return { success: false, error: 'Admin privileges required' };
                }

                const folder = params.folderPath || process.cwd();
                const fullPath = path.resolve(folder);

                try {
                    // Check if already a git repo
                    const checkResult = await runGitCommand('git rev-parse --git-dir', fullPath);
                    if (checkResult.success) {
                        return { success: true, message: 'Already a git repository', path: fullPath };
                    }

                    // Initialize
                    const result = await runGitCommand('git init', fullPath);
                    if (result.success) {
                        return { success: true, message: 'Git repository initialized', path: fullPath };
                    } else {
                        return { success: false, error: result.error };
                    }
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },

        gitAdd: {
            description: 'Add files to git staging area',
            parameters: {
                files: {
                    type: 'string',
                    description: 'Files to add (use "." for all files)',
                },
                folderPath: {
                    type: 'string',
                    description: 'Path to the git repository',
                    required: false,
                },
            },
            execute: async (params, ctx) => {
                if (!ctx.isAdmin) {
                    return { success: false, error: 'Admin privileges required' };
                }

                const folder = params.folderPath || process.cwd();
                const fullPath = path.resolve(folder);
                const files = params.files || '.';

                // Sanitize files parameter - only allow safe patterns
                if (files !== '.' && files !== '*' && !/^[a-zA-Z0-9_./-]+$/.test(files)) {
                    return { success: false, error: 'Invalid file pattern. Use ".", "*", or a simple file path.' };
                }

                const result = await runGitCommand(`git add ${escapeShellArg(files)}`, fullPath);
                if (result.success) {
                    return { success: true, message: `Added ${files}` };
                } else {
                    return { success: false, error: result.stderr || result.error };
                }
            },
        },

        gitCommit: {
            description: 'Commit changes to git repository',
            parameters: {
                message: {
                    type: 'string',
                    description: 'Commit message',
                },
                folderPath: {
                    type: 'string',
                    description: 'Path to the git repository',
                    required: false,
                },
            },
            execute: async (params, ctx) => {
                if (!ctx.isAdmin) {
                    return { success: false, error: 'Admin privileges required' };
                }

                const folder = params.folderPath || process.cwd();
                const fullPath = path.resolve(folder);
                const message = params.message || 'Update';

                try {
                    // Ensure git config is set
                    await ensureGitConfig(fullPath);

                    // Add all files first
                    await runGitCommand('git add .', fullPath);

                    // Commit with properly escaped message
                    const result = await runGitCommand(`git commit -m ${escapeShellArg(message)}`, fullPath);
                    if (result.success) {
                        return { success: true, message: `Committed: ${message}` };
                    } else if (result.stderr.includes('nothing to commit') || result.stderr.includes('no changes')) {
                        return { success: true, message: 'Nothing to commit' };
                    } else {
                        return { success: false, error: result.stderr || result.error };
                    }
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },

        createGitHubRepository: {
            description: 'Create a GitHub repository and add it as remote',
            parameters: {
                repoName: {
                    type: 'string',
                    description: 'Name of the repository',
                },
                description: {
                    type: 'string',
                    description: 'Repository description',
                    required: false,
                },
                isPrivate: {
                    type: 'boolean',
                    description: 'Whether the repository should be private',
                    required: false,
                },
                folderPath: {
                    type: 'string',
                    description: 'Path to the git repository',
                    required: false,
                },
            },
            execute: async (params, ctx) => {
                if (!ctx.isAdmin) {
                    return { success: false, error: 'Admin privileges required' };
                }

                const token = getGitHubToken(ctx);
                if (!token) {
                    return { success: false, error: 'GitHub token not configured. Add to config.json under plugins.github.token' };
                }

                const folder = params.folderPath || process.cwd();
                const fullPath = path.resolve(folder);

                try {
                    // Create repo on GitHub
                    // Support both old token format and new Bearer format
                    const authHeader = token.startsWith('ghp_') || token.startsWith('github_pat_')
                        ? `Bearer ${token}`
                        : `token ${token}`;

                    const response = await fetch('https://api.github.com/user/repos', {
                        method: 'POST',
                        headers: {
                            'Authorization': authHeader,
                            'Accept': 'application/vnd.github.v3+json',
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            name: params.repoName,
                            description: params.description || '',
                            private: params.isPrivate || false,
                            auto_init: false,
                        }),
                    });

                    const data = await response.json();

                    if (!response.ok) {
                        return { success: false, error: data.message || 'Failed to create repository' };
                    }

                    // Check if remote already exists
                    const remoteCheck = await runGitCommand('git remote get-url origin', fullPath);
                    if (remoteCheck.success) {
                        // Update existing remote
                        const updateResult = await runGitCommand(`git remote set-url origin ${escapeShellArg(data.clone_url)}`, fullPath);
                        if (!updateResult.success) {
                            return { success: false, error: `Repository created but failed to update remote: ${updateResult.error}` };
                        }
                    } else {
                        // Add new remote
                        const remoteResult = await runGitCommand(`git remote add origin ${escapeShellArg(data.clone_url)}`, fullPath);
                        if (!remoteResult.success) {
                            return { success: false, error: `Repository created but failed to add remote: ${remoteResult.error}` };
                        }
                    }

                    return {
                        success: true,
                        url: data.html_url,
                        cloneUrl: data.clone_url,
                        message: 'Repository created and remote added',
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },

        gitPush: {
            description: 'Push commits to GitHub',
            parameters: {
                remote: {
                    type: 'string',
                    description: 'Remote name (default: origin)',
                    required: false,
                },
                branch: {
                    type: 'string',
                    description: 'Branch name (default: main)',
                    required: false,
                },
                folderPath: {
                    type: 'string',
                    description: 'Path to the git repository',
                    required: false,
                },
            },
            execute: async (params, ctx) => {
                if (!ctx.isAdmin) {
                    return { success: false, error: 'Admin privileges required' };
                }

                const folder = params.folderPath || process.cwd();
                const fullPath = path.resolve(folder);
                const remote = params.remote || 'origin';
                const branch = params.branch || 'main';

                // Validate branch name
                if (!/^[a-zA-Z0-9._/-]+$/.test(branch)) {
                    return { success: false, error: 'Invalid branch name' };
                }

                try {
                    // Check if remote exists
                    const remoteCheck = await runGitCommand(`git remote get-url ${escapeShellArg(remote)}`, fullPath);
                    if (!remoteCheck.success) {
                        return { success: false, error: `Remote "${remote}" not found. Create repository first.` };
                    }

                    // Check if branch exists locally, if not create it
                    const branchCheck = await runGitCommand(`git rev-parse --verify ${escapeShellArg(branch)}`, fullPath);
                    if (!branchCheck.success) {
                        // Create branch
                        const createBranch = await runGitCommand(`git checkout -b ${escapeShellArg(branch)}`, fullPath);
                        if (!createBranch.success) {
                            // Try to checkout existing branch or create from current
                            await runGitCommand(`git branch ${escapeShellArg(branch)}`, fullPath);
                        }
                    }

                    // Push
                    const pushResult = await runGitCommand(`git push -u ${escapeShellArg(remote)} ${escapeShellArg(branch)}`, fullPath);
                    if (pushResult.success) {
                        return { success: true, message: `Pushed to ${remote}/${branch}` };
                    } else {
                        return { success: false, error: pushResult.stderr || pushResult.error };
                    }
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },

        editGitHubFile: {
            description: 'Edit or create a file in a remote GitHub repository',
            parameters: {
                repository: {
                    type: 'string',
                    description: 'Repository name (e.g., "username/repo") or full GitHub URL',
                },
                filePath: {
                    type: 'string',
                    description: 'Path to the file in the repository (e.g., "src/index.js")',
                },
                content: {
                    type: 'string',
                    description: 'New content for the file',
                },
                message: {
                    type: 'string',
                    description: 'Commit message',
                    required: false,
                },
                branch: {
                    type: 'string',
                    description: 'Branch name (default: main)',
                    required: false,
                },
            },
            execute: async (params, ctx) => {
                if (!ctx.isAdmin) {
                    return { success: false, error: 'Admin privileges required' };
                }

                const token = getGitHubToken(ctx);
                if (!token) {
                    return { success: false, error: 'GitHub token not configured. Add to config.json under plugins.github.token' };
                }

                try {
                    // Parse repository name from URL or use as-is
                    let repoName = params.repository;
                    if (repoName.includes('github.com/')) {
                        // Extract repo name from URL
                        const match = repoName.match(/github\.com\/([^\/]+\/[^\/]+)/);
                        if (match) {
                            repoName = match[1].replace(/\.git$/, '');
                        }
                    }

                    const branch = params.branch || 'main';
                    const filePath = params.filePath;
                    const content = params.content;
                    const commitMessage = params.message || `Update ${filePath}`;

                    // Support both old token format and new Bearer format
                    const authHeader = token.startsWith('ghp_') || token.startsWith('github_pat_')
                        ? `Bearer ${token}`
                        : `token ${token}`;

                    // First, get the current file to get its SHA (if it exists)
                    let sha = null;
                    try {
                        const getResponse = await fetch(
                            `https://api.github.com/repos/${repoName}/contents/${encodeURIComponent(filePath)}?ref=${branch}`,
                            {
                                headers: {
                                    'Authorization': authHeader,
                                    'Accept': 'application/vnd.github.v3+json',
                                },
                            }
                        );

                        if (getResponse.ok) {
                            const fileData = await getResponse.json();
                            sha = fileData.sha;
                        }
                    } catch (err) {
                        // File doesn't exist, that's okay - we'll create it
                    }

                    // Encode content to base64
                    const contentBase64 = Buffer.from(content, 'utf-8').toString('base64');

                    // Create or update the file
                    const response = await fetch(
                        `https://api.github.com/repos/${repoName}/contents/${encodeURIComponent(filePath)}`,
                        {
                            method: 'PUT',
                            headers: {
                                'Authorization': authHeader,
                                'Accept': 'application/vnd.github.v3+json',
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                message: commitMessage,
                                content: contentBase64,
                                branch: branch,
                                ...(sha ? { sha } : {}), // Include SHA if updating existing file
                            }),
                        }
                    );

                    const data = await response.json();

                    if (!response.ok) {
                        return { success: false, error: data.message || 'Failed to update file' };
                    }

                    return {
                        success: true,
                        message: sha ? 'File updated' : 'File created',
                        url: data.content.html_url,
                        commit: data.commit.html_url,
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },

        getGitHubFile: {
            description: 'Get file contents from a remote GitHub repository',
            parameters: {
                repository: {
                    type: 'string',
                    description: 'Repository name (e.g., "username/repo") or full GitHub URL',
                },
                filePath: {
                    type: 'string',
                    description: 'Path to the file in the repository (e.g., "src/index.js")',
                },
                branch: {
                    type: 'string',
                    description: 'Branch name (default: main)',
                    required: false,
                },
            },
            execute: async (params, ctx) => {
                const token = getGitHubToken(ctx);
                if (!token) {
                    return { success: false, error: 'GitHub token not configured' };
                }

                try {
                    // Parse repository name from URL or use as-is
                    let repoName = params.repository;
                    if (repoName.includes('github.com/')) {
                        const match = repoName.match(/github\.com\/([^\/]+\/[^\/]+)/);
                        if (match) {
                            repoName = match[1].replace(/\.git$/, '');
                        }
                    }

                    const branch = params.branch || 'main';
                    const filePath = params.filePath;

                    // Support both old token format and new Bearer format
                    const authHeader = token.startsWith('ghp_') || token.startsWith('github_pat_')
                        ? `Bearer ${token}`
                        : `token ${token}`;

                    const response = await fetch(
                        `https://api.github.com/repos/${repoName}/contents/${encodeURIComponent(filePath)}?ref=${branch}`,
                        {
                            headers: {
                                'Authorization': authHeader,
                                'Accept': 'application/vnd.github.v3+json',
                            },
                        }
                    );

                    if (!response.ok) {
                        const error = await response.json();
                        return { success: false, error: error.message || 'Failed to get file' };
                    }

                    const data = await response.json();

                    // Decode base64 content
                    const content = Buffer.from(data.content, 'base64').toString('utf-8');

                    return {
                        success: true,
                        content: content,
                        size: data.size,
                        url: data.html_url,
                        sha: data.sha,
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },

        deleteGitHubFile: {
            description: 'Delete a file from a remote GitHub repository',
            parameters: {
                repository: {
                    type: 'string',
                    description: 'Repository name (e.g., "username/repo") or full GitHub URL',
                },
                filePath: {
                    type: 'string',
                    description: 'Path to the file in the repository',
                },
                message: {
                    type: 'string',
                    description: 'Commit message',
                    required: false,
                },
                branch: {
                    type: 'string',
                    description: 'Branch name (default: main)',
                    required: false,
                },
            },
            execute: async (params, ctx) => {
                if (!ctx.isAdmin) {
                    return { success: false, error: 'Admin privileges required' };
                }

                const token = getGitHubToken(ctx);
                if (!token) {
                    return { success: false, error: 'GitHub token not configured' };
                }

                try {
                    // Parse repository name from URL or use as-is
                    let repoName = params.repository;
                    if (repoName.includes('github.com/')) {
                        const match = repoName.match(/github\.com\/([^\/]+\/[^\/]+)/);
                        if (match) {
                            repoName = match[1].replace(/\.git$/, '');
                        }
                    }

                    const branch = params.branch || 'main';
                    const filePath = params.filePath;
                    const commitMessage = params.message || `Delete ${filePath}`;

                    // Support both old token format and new Bearer format
                    const authHeader = token.startsWith('ghp_') || token.startsWith('github_pat_')
                        ? `Bearer ${token}`
                        : `token ${token}`;

                    // First, get the file to get its SHA
                    const getResponse = await fetch(
                        `https://api.github.com/repos/${repoName}/contents/${encodeURIComponent(filePath)}?ref=${branch}`,
                        {
                            headers: {
                                'Authorization': authHeader,
                                'Accept': 'application/vnd.github.v3+json',
                            },
                        }
                    );

                    if (!getResponse.ok) {
                        return { success: false, error: 'File not found' };
                    }

                    const fileData = await getResponse.json();

                    // Delete the file
                    const response = await fetch(
                        `https://api.github.com/repos/${repoName}/contents/${encodeURIComponent(filePath)}`,
                        {
                            method: 'DELETE',
                            headers: {
                                'Authorization': authHeader,
                                'Accept': 'application/vnd.github.v3+json',
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                message: commitMessage,
                                sha: fileData.sha,
                                branch: branch,
                            }),
                        }
                    );

                    if (!response.ok) {
                        const error = await response.json();
                        return { success: false, error: error.message || 'Failed to delete file' };
                    }

                    return {
                        success: true,
                        message: 'File deleted',
                        commit: (await response.json()).commit.html_url,
                    };
                } catch (error) {
                    return { success: false, error: error.message };
                }
            },
        },
    },
});

