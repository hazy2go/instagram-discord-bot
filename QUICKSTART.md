# Quick Start Guide

Get your Instagram Discord bot running in 5 minutes!

## 1. Install Dependencies

```bash
cd instagram-discord-bot
npm install
```

## 2. Get Your Discord Bot Token

1. Go to https://discord.com/developers/applications
2. Click "New Application" → Name it
3. Go to "Bot" → Click "Add Bot"
4. Click "Reset Token" and copy it
5. Go to "OAuth2" → "General" → Copy the "Application ID"

## 3. Configure

```bash
# Create .env file
cp .env.example .env

# Edit it (use nano, vim, or any text editor)
nano .env
```

Add your values:
```env
DISCORD_TOKEN=paste_your_token_here
DISCORD_CLIENT_ID=paste_your_client_id_here
CHECK_INTERVAL=5
```

## 4. Invite Bot to Your Server

Use this link (replace YOUR_CLIENT_ID):

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=277025770560&scope=bot%20applications.commands
```

## 5. Deploy Commands & Start

```bash
# Register commands with Discord (one-time)
npm run deploy-commands

# Start the bot
npm start
```

## 6. Use It!

In Discord:

```
/track username:nike channel:#sneakers
/list
/status
```

That's it! Your bot is now monitoring Instagram accounts.

## Next Steps

- Read the full [README.md](README.md) for all features
- Set up custom notification messages
- Configure role mentions
- Deploy to production with PM2 or Docker

## Common First-Time Issues

**Bot doesn't respond to commands:**
- Did you run `npm run deploy-commands`?
- Does the bot have permissions in that channel?
- Do you have "Manage Server" permission?

**"Could not find Instagram account":**
- Is the account public?
- Is the username correct (no @ symbol)?
- Try again in a minute (rate limiting)

**Bot crashes on start:**
- Check your `.env` file has valid token and client ID
- Make sure Node.js 18+ is installed: `node --version`

Need help? Check the full [README.md](README.md) troubleshooting section.
