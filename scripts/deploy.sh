#!/bin/bash

# ╔═══════════════════════════════════════════════════════════════╗
# ║                 FREPPEBOT VPS DEPLOY SCRIPT                    ║
# ║                                                                 ║
# ║   Run this on a fresh VPS to deploy FreppeBot                  ║
# ║   Usage: curl -fsSL https://raw.githubusercontent.com/.../deploy.sh | bash
# ╚═══════════════════════════════════════════════════════════════╝

set -e

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║            FreppeBot VPS Deployment Script                    ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo systemctl enable docker
    sudo systemctl start docker
    echo "✅ Docker installed"
else
    echo "✅ Docker already installed"
fi

# Check if Docker Compose is available
if ! docker compose version &> /dev/null; then
    echo "📦 Installing Docker Compose..."
    sudo apt-get update
    sudo apt-get install -y docker-compose-plugin
    echo "✅ Docker Compose installed"
else
    echo "✅ Docker Compose already installed"
fi

# Create directory
INSTALL_DIR="$HOME/freppebot"
echo ""
echo "📁 Installing to: $INSTALL_DIR"

if [ -d "$INSTALL_DIR" ]; then
    echo "⚠️  Directory already exists. Updating..."
    cd "$INSTALL_DIR"
    git pull
else
    echo "📥 Cloning repository..."
    git clone https://github.com/yourusername/freppebot.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# Check for .env
if [ ! -f ".env" ]; then
    echo ""
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo ""
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║  IMPORTANT: You need to configure your API keys!             ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Edit the .env file with your API keys:"
    echo "  nano $INSTALL_DIR/.env"
    echo ""
    echo "Then run:"
    echo "  cd $INSTALL_DIR && docker compose up -d"
    echo ""
else
    echo "✅ .env file exists"
    echo ""
    echo "🚀 Starting FreppeBot..."
    docker compose up -d --build
    echo ""
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║  ✅ FreppeBot is now running!                                 ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo ""
    echo "Commands:"
    echo "  View logs:    docker compose logs -f"
    echo "  Stop:         docker compose down"
    echo "  Restart:      docker compose restart"
    echo "  Update:       git pull && docker compose up -d --build"
    echo ""
fi
