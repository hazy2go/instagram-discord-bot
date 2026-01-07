#!/bin/bash

# Instagram Discord Bot - Setup Script
# This script helps you set up the bot for the first time

echo "╔════════════════════════════════════════════════════════╗"
echo "║   Instagram Discord Bot - Setup Script                ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""

# Check Node.js version
echo "[1/6] Checking Node.js version..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "   Please install Node.js 18 or higher from: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version is too old ($(node -v))"
    echo "   Please upgrade to Node.js 18 or higher"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"
echo ""

# Install dependencies
echo "[2/6] Installing dependencies..."
if [ -f "package.json" ]; then
    npm install
    if [ $? -eq 0 ]; then
        echo "✅ Dependencies installed"
    else
        echo "❌ Failed to install dependencies"
        exit 1
    fi
else
    echo "❌ package.json not found. Are you in the correct directory?"
    exit 1
fi
echo ""

# Create .env file
echo "[3/6] Creating .env file..."
if [ -f ".env" ]; then
    echo "⚠️  .env file already exists. Skipping..."
else
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✅ .env file created from template"
    else
        echo "❌ .env.example not found"
        exit 1
    fi
fi
echo ""

# Create data directory
echo "[4/6] Creating data directory..."
mkdir -p data
echo "✅ Data directory created"
echo ""

# Check .env configuration
echo "[5/6] Checking .env configuration..."
if [ -f ".env" ]; then
    if grep -q "your_discord_bot_token_here" .env; then
        echo "⚠️  WARNING: .env still contains placeholder values!"
        echo ""
        echo "   Please edit .env and add:"
        echo "   - DISCORD_TOKEN (from https://discord.com/developers/applications)"
        echo "   - DISCORD_CLIENT_ID (from same page)"
        echo ""
        echo "   After editing, run: npm run deploy-commands"
        echo ""
    else
        echo "✅ .env appears to be configured"
    fi
else
    echo "❌ .env file not found"
    exit 1
fi

# Show next steps
echo "[6/6] Setup complete!"
echo ""
echo "╔════════════════════════════════════════════════════════╗"
echo "║   Next Steps                                           ║"
echo "╚════════════════════════════════════════════════════════╝"
echo ""
echo "1. Edit your .env file with Discord bot credentials:"
echo "   nano .env"
echo ""
echo "2. Register slash commands with Discord:"
echo "   npm run deploy-commands"
echo ""
echo "3. Invite bot to your server:"
echo "   https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=277025770560&scope=bot%20applications.commands"
echo ""
echo "4. Start the bot:"
echo "   npm start"
echo ""
echo "5. In Discord, use:"
echo "   /track username:nike channel:#updates"
echo ""
echo "📚 For detailed instructions, read:"
echo "   - QUICKSTART.md (5-minute guide)"
echo "   - README.md (complete documentation)"
echo "   - EXAMPLES.md (real-world examples)"
echo ""
echo "Happy monitoring! 🚀"
