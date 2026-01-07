# 🚀 START HERE - Instagram Discord Bot

Welcome! This bot monitors Instagram accounts and sends notifications to your Discord server within 5-10 minutes of new posts.

## What This Bot Does

✅ **Tracks Instagram accounts** - Monitor unlimited public Instagram profiles  
✅ **Fast notifications** - 5-10 minute detection time (configurable)  
✅ **Customizable messages** - Set custom notification text per account  
✅ **Multi-channel support** - Send different accounts to different channels  
✅ **Role mentions** - Ping specific roles when posts are detected  
✅ **Reboot safe** - All settings persist through restarts  
✅ **Easy admin panel** - Manage everything via Discord slash commands  

## Quick Start (5 Minutes)

### 1. Install

```bash
cd instagram-discord-bot
./setup.sh
```

Or manually:
```bash
npm install
cp .env.example .env
```

### 2. Get Discord Bot Token

1. Go to https://discord.com/developers/applications
2. Click "New Application" → Name it
3. Go to "Bot" → "Add Bot"
4. Copy the token
5. Go to "OAuth2" → Copy "Application ID"

### 3. Configure

Edit `.env`:
```bash
DISCORD_TOKEN=your_token_here
DISCORD_CLIENT_ID=your_client_id_here
CHECK_INTERVAL=5
```

### 4. Deploy Commands

```bash
npm run deploy-commands
```

### 5. Invite Bot

Use this URL (replace YOUR_CLIENT_ID):
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=277025770560&scope=bot%20applications.commands
```

### 6. Start Bot

```bash
npm start
```

### 7. Use It!

In Discord:
```
/track username:nike channel:#sneakers
/list
/status
```

Done! 🎉

## Available Commands

| Command | Description |
|---------|-------------|
| `/track` | Start tracking an Instagram account |
| `/untrack` | Stop tracking an account |
| `/list` | Show all tracked accounts in this server |
| `/status` | Check bot health and monitoring status |
| `/check` | Manually check an account for new posts |
| `/update` | Update notification settings |

## Example Usage

**Track Nike's Instagram:**
```
/track username:nike channel:#sneakers
```

**With custom message:**
```
/track username:nike channel:#sneakers message:🔥 NEW NIKE DROP! {url}
```

**With role mention:**
```
/track username:nike channel:#sneakers mention:@Sneakerheads
```

**Multiple accounts:**
```
/track username:adidas channel:#sneakers
/track username:puma channel:#sneakers
/track username:supreme channel:#streetwear
```

## Documentation Files

- **QUICKSTART.md** - Fast 5-minute setup guide
- **README.md** - Complete documentation (400+ lines)
- **EXAMPLES.md** - Real-world usage examples
- **ARCHITECTURE.md** - Technical architecture details
- **PROJECT_SUMMARY.md** - Development overview

## Project Structure

```
instagram-discord-bot/
├── src/
│   ├── commands/          # Discord slash commands
│   ├── services/          # Core business logic
│   ├── index.js          # Main entry point
│   └── deploy-commands.js # Command registration
├── data/                 # Database (auto-created)
├── .env                  # Your configuration
└── package.json          # Dependencies
```

## How It Works

1. **Monitoring Loop** - Every 5-10 minutes, checks all tracked accounts
2. **Multi-Strategy Fetching** - Uses RSS Bridge, Bibliogram, and direct API
3. **Smart Detection** - Compares post IDs to detect new posts
4. **Duplicate Prevention** - Tracks post history to avoid duplicate notifications
5. **Discord Notifications** - Sends rich embeds to configured channels
6. **Database Persistence** - SQLite stores all settings (survives reboots)

## Troubleshooting

**Bot doesn't respond:**
- Did you run `npm run deploy-commands`?
- Check bot has permissions in the channel
- Verify you have "Manage Server" permission

**Can't find Instagram account:**
- Is the account public?
- Is username correct (no @ symbol)?
- Try again in a minute (rate limiting)

**Notifications delayed:**
- This is normal (5-10 min check interval)
- Public RSS Bridge can be slow
- Consider self-hosting RSS Bridge

**Bot crashed:**
- Check `.env` has valid token/client ID
- Ensure Node.js 18+ installed: `node --version`
- Check logs for error messages

## Production Deployment

### Using PM2 (Recommended)
```bash
npm install -g pm2
pm2 start src/index.js --name instagram-bot
pm2 startup
pm2 save
```

### Using Docker
```bash
docker build -t instagram-bot .
docker run -d --restart unless-stopped \
  -v $(pwd)/data:/app/data \
  --env-file .env \
  instagram-bot
```

See README.md for systemd setup.

## Features

### Customization
- Custom notification messages with variables
- Per-account, per-channel settings
- Role mentions (optional)
- Adjustable check interval

### Reliability
- Multiple Instagram fetch strategies
- Graceful error handling
- Reboot-safe database
- Continues on individual failures

### Admin Panel
- 6 slash commands
- Autocomplete for usernames
- Permission management
- Real-time status checks

### Database
- SQLite (no separate server needed)
- Automatic cleanup of old data
- Indexed for performance
- Easy backups (single file)

## Limitations

- **Public accounts only** (no private profiles)
- **5-10 minute detection** (Instagram API limits)
- **Rate limits** (public endpoints are limited)
- **No stories** (only feed posts)

## Support & Community

- **Issues**: Report bugs on GitHub
- **Documentation**: See README.md
- **Examples**: See EXAMPLES.md
- **License**: MIT (free to use and modify)

## Technical Stack

- Node.js 18+
- Discord.js 14
- SQLite (better-sqlite3)
- RSS Bridge (community service)
- Axios (HTTP client)
- node-cron (scheduling)

## What's Next?

1. ✅ Set up the bot (you are here!)
2. Track your first Instagram account
3. Customize notification messages
4. Add more accounts as needed
5. Set up production deployment (PM2/Docker)
6. Monitor with `/status` command

## Quick Reference

### Environment Variables
```env
DISCORD_TOKEN=required
DISCORD_CLIENT_ID=required
CHECK_INTERVAL=5 (optional, in minutes)
```

### Template Variables
Use in custom messages:
- `{username}` - Instagram username
- `{display_name}` - Display name
- `{url}` - Post URL
- `{title}` - Caption preview

### Permissions Required
- Send Messages
- Embed Links
- Use Slash Commands
- Mention Roles (if using mentions)

## Getting Help

1. Check README.md troubleshooting section
2. Use `/status` to check bot health
3. Review console logs for errors
4. Try `/check username:account` to test manually
5. Create GitHub issue for bugs

---

**Ready to start?** Run `./setup.sh` or follow the Quick Start above!

For detailed instructions, see **QUICKSTART.md** or **README.md**.

Happy monitoring! 🎉
