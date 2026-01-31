/**
 * ╔═══════════════════════════════════════════════════════════════╗
 * ║                     FREPPEBOT MAIN ENTRY                       ║
 * ║         Self-hosted AI assistant with easy plugin system       ║
 * ╚═══════════════════════════════════════════════════════════════╝
 * 
 * Commands:
 *   npm run setup  - Interactive configuration wizard
 *   npm start      - Start the bot
 *   npm run dev    - Start with auto-reload
 */

const fs = require('fs');
const path = require('path');
const FreppeBot = require('./core/bot');
const logger = require('./utils/logger');
const { printBanner } = require('./utils/banner');
const { loadConfig } = require('./utils/config');

async function main() {
  printBanner();

  // Check for config.json
  const configPath = path.join(process.cwd(), 'config.json');
  if (!fs.existsSync(configPath)) {
    console.log('\n❌ config.json not found!\n');
    console.log('Run the setup wizard to configure your bot:\n');
    console.log('  npm run setup\n');
    process.exit(1);
  }

  // Load configuration
  const config = loadConfig();
  logger.info('Configuration loaded from config.json');

  try {
    const bot = new FreppeBot(config);
    await bot.initialize();
    await bot.start();

    logger.info('🚀 FreppeBot is running!');
    logger.info('Press Ctrl+C to stop');

    // Graceful shutdown with timeout
    let shutdownInProgress = false;
    const shutdown = async (signal) => {
      if (shutdownInProgress) {
        logger.warn('Shutdown already in progress, forcing exit...');
        process.exit(1);
      }
      
      shutdownInProgress = true;
      logger.info(`\n${signal} received, shutting down gracefully...`);
      
      // Set timeout for graceful shutdown (30 seconds)
      const shutdownTimeout = setTimeout(() => {
        logger.error('Shutdown timeout exceeded, forcing exit...');
        process.exit(1);
      }, 30000);
      
      try {
        await bot.stop();
        clearTimeout(shutdownTimeout);
        logger.info('Shutdown complete');
        process.exit(0);
      } catch (error) {
        clearTimeout(shutdownTimeout);
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

  } catch (error) {
    logger.error('Failed to start FreppeBot:', error);
    process.exit(1);
  }
}

main();
