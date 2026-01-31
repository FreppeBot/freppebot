# ╔═══════════════════════════════════════════════════════════════╗
# ║                    FREPPEBOT DOCKERFILE                        ║
# ║          Easy VPS deployment - just docker compose up!         ║
# ╚═══════════════════════════════════════════════════════════════╝

FROM node:20-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies (no native deps needed with sql.js!)
RUN npm ci --only=production

# Copy application code
COPY . .

# Create data directory for persistence
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('healthy')" || exit 1

# Run the bot
CMD ["node", "src/index.js"]
