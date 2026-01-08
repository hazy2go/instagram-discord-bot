# Instagram Discord Bot

A robust Discord.js bot that monitors Instagram accounts and sends real-time notifications to Discord channels when new posts are detected. Features include customizable notifications, multi-channel support, reboot safety, and a comprehensive admin panel.

## Features

- **Fast Detection:** Checks for new posts every 5-10 minutes (configurable)
- **Multiple Tracking:** Monitor unlimited Instagram accounts simultaneously
- **Customizable Notifications:** Set custom messages with template variables
- **Multi-Channel Support:** Send notifications to different channels per account
- **Role Mentions:** Optionally mention roles when new posts are detected
- **Active Hours:** Only check during specific hours to reduce API calls (e.g., 9 PM - 5 AM JST)
- **Admin Panel:** Easy-to-use Discord slash commands for management
- **Reboot Safe:** SQLite database persists all settings and tracking data
- **Fallback Strategies:** Multiple methods to fetch Instagram data (Direct API, Web Scraping, RSS Bridge, Bibliogram)
- **Graceful Error Handling:** Continues monitoring even if individual accounts fail

## How It Works

The bot uses multiple strategies to fetch Instagram posts (ordered by speed):

1. **Direct API** (Primary): Instagram's public JSON endpoint - real-time, fastest
2. **Web Scraping** (Fallback): Scrapes Instagram HTML pages - real-time, reliable
3. **RSS Bridge** (Backup): Public RSS Bridge instances - may be cached/slow
4. **Bibliogram** (Last Resort): Community-run frontend - mostly deprecated

This multi-layered approach ensures maximum reliability and real-time detection. See [FETCH_STRATEGY.md](FETCH_STRATEGY.md) for detailed explanation.

## Prerequisites

- Node.js 18.x or higher
- A Discord bot token ([Create one here](https://discord.com/developers/applications))
- Discord bot must have the following permissions:
  - Send Messages
  - Embed Links
  - Read Message History
  - Use Slash Commands

## Installation

### 1. Clone or Download

```bash
# Clone the repository (or download and extract)
git clone <your-repo-url>
cd instagram-discord-bot

# Install dependencies
npm install
```

### 2. Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to "Bot" section and click "Add Bot"
4. Under "Privileged Gateway Intents", enable:
   - PRESENCE INTENT (optional)
   - SERVER MEMBERS INTENT (optional)
   - MESSAGE CONTENT INTENT (optional)
5. Copy the bot token (you'll need this for `.env`)
6. Go to "OAuth2" > "General" and copy the "Application ID" (Client ID)

### 3. Configure Environment Variables

```bash
# Copy the example environment file
cp .env.example .env

# Edit .env with your favorite editor
nano .env
```

Fill in the required values:

```env
# Required
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here

# Optional
CHECK_INTERVAL=5
ADMIN_ROLE_ID=your_admin_role_id_here
```

### 4. Invite Bot to Your Server

Create an invite link with these permissions:

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=2048&scope=bot%20applications.commands
```

Replace `YOUR_CLIENT_ID` with your actual Client ID.

**Minimum Permissions Required:** `2048` (Send Messages + Embed Links)

**Recommended Permissions:** `277025770560` (Send Messages, Embed Links, Mention Roles, Read Message History)

### 5. Deploy Slash Commands

```bash
npm run deploy-commands
```

This registers all slash commands with Discord. You only need to run this once, or when you add/modify commands.

### 6. Start the Bot

```bash
# Production
npm start

# Development (with auto-restart)
npm run dev
```

You should see:

```
[Bot] Initializing services...
[Bot] Loaded command: track
[Bot] Loaded command: untrack
[Bot] Loaded command: list
[Bot] Loaded command: status
[Bot] Loaded command: check
[Bot] Logging in to Discord...
[Bot] Logged in as YourBot#1234
[Monitor] Starting monitor with 5 minute interval
[Bot] Ready!
```

## Usage

All commands require the "Manage Server" permission by default.

### Track an Instagram Account

```
/track username:example_user channel:#notifications
```

**Options:**
- `username` (required): Instagram username without the @ symbol
- `channel` (required): Discord channel to send notifications to
- `message` (optional): Custom notification message
- `mention` (optional): Role to mention when posting

**Custom Message Variables:**
- `{username}` - Instagram username
- `{display_name}` - Display name (if available)
- `{url}` - Direct link to the post
- `{title}` - Post title/caption preview

**Example:**

```
/track username:nike channel:#sneaker-drops message:New drop from {username}! {url} mention:@Sneakerheads
```

### List Tracked Accounts

```
/list
```

Shows all Instagram accounts being tracked in your server, including channels and notification settings.

### Check Account Status

```
/status
```

Displays monitoring status, check interval, number of accounts tracked, and recent check times.

### Manually Check an Account

```
/check username:example_user
```

Forces an immediate check for new posts (useful for testing).

### Stop Tracking an Account

```
/untrack username:example_user
```

Stops tracking the account for your server. Optionally specify a channel to remove only that notification.

**Options:**
- `username` (required): Instagram username to untrack
- `channel` (optional): Specific channel to stop notifications for

## Configuration

### Check Interval

Edit `.env` file:

```env
CHECK_INTERVAL=5  # Check every 5 minutes
```

**Recommended:** 5-10 minutes to avoid rate limiting

**Minimum:** 5 minutes (lower values may result in rate limiting)

### Active Hours (Optional)

Reduce API calls by only checking during specific hours when posts are most likely:

```env
ACTIVE_HOURS_START=21  # Start at 9 PM (21:00)
ACTIVE_HOURS_END=5     # Stop at 5 AM (05:00)
ACTIVE_HOURS_TIMEZONE=Asia/Tokyo  # JST timezone
```

**Benefits:**
- Reduces API calls by 50-70%
- Avoids rate limits
- Focuses checks on peak posting times

**Example:** If your Instagram accounts post between 9 PM and 5 AM JST, set those as active hours. The bot will skip checks outside this window.

Leave empty or comment out to check 24/7. See [ACTIVE_HOURS.md](ACTIVE_HOURS.md) for detailed configuration guide.

### RSS Bridge Instance

By default, the bot uses public RSS Bridge instances. You can self-host RSS Bridge for better reliability:

```env
RSS_BRIDGE_URL=https://your-rssbridge-instance.com
```

[How to self-host RSS Bridge](https://github.com/RSS-Bridge/rss-bridge)

### Admin Permissions

By default, only users with "Manage Server" permission can use bot commands. To restrict to a specific role:

1. Get the role ID (Enable Developer Mode in Discord, right-click role, Copy ID)
2. Add to `.env`:

```env
ADMIN_ROLE_ID=123456789012345678
```

## Database

The bot uses SQLite for persistence. All data is stored in:

```
data/bot.db
```

**Tables:**
- `instagram_accounts` - Tracked Instagram accounts
- `notification_settings` - Notification configurations per account/channel
- `post_history` - Post tracking to prevent duplicate notifications

**Backup Recommendation:** Regularly backup the `data/` directory.

## Troubleshooting

### "Could not find or access Instagram account"

- Verify the username is correct (no @ symbol)
- Ensure the account is public
- The account might be rate-limited or blocked by Instagram
- Try again in a few minutes

### "No posts found" or delayed notifications

- Public RSS Bridge instances can be rate-limited
- Consider self-hosting RSS Bridge
- Increase `CHECK_INTERVAL` to 10-15 minutes
- Some Instagram accounts may not be accessible via RSS

### Bot not responding to commands

- Ensure commands are deployed: `npm run deploy-commands`
- Check bot has proper permissions in the channel
- Verify bot is online and logs show no errors
- Check you have "Manage Server" permission

### Database locked errors

- Only run one instance of the bot at a time
- If the bot crashed, delete the `data/bot.db-wal` and `data/bot.db-shm` files

## Production Deployment

### Using PM2 (Recommended)

```bash
# Install PM2
npm install -g pm2

# Start bot
pm2 start src/index.js --name instagram-bot

# Auto-restart on reboot
pm2 startup
pm2 save

# View logs
pm2 logs instagram-bot

# Restart
pm2 restart instagram-bot
```

### Using systemd

Create `/etc/systemd/system/instagram-bot.service`:

```ini
[Unit]
Description=Instagram Discord Bot
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/instagram-discord-bot
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl enable instagram-bot
sudo systemctl start instagram-bot
sudo systemctl status instagram-bot
```

### Using Docker

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

CMD ["node", "src/index.js"]
```

Build and run:

```bash
docker build -t instagram-bot .
docker run -d --name instagram-bot --restart unless-stopped -v $(pwd)/data:/app/data --env-file .env instagram-bot
```

## Rate Limiting & Best Practices

- **Recommended check interval:** 5-10 minutes
- **Maximum accounts:** No hard limit, but 50+ accounts may require longer intervals
- **Avoid:** Checking the same account from multiple bots
- **Self-hosting RSS Bridge:** Significantly improves reliability for 10+ accounts

## Security Notes

- Never commit `.env` or `.db` files to version control
- Keep your Discord bot token secret
- Regularly update dependencies: `npm update`
- Only track public Instagram accounts
- Respect Instagram's Terms of Service

## Architecture

```
src/
├── commands/           # Discord slash commands
│   ├── track.js       # Add Instagram account tracking
│   ├── untrack.js     # Remove tracking
│   ├── list.js        # List tracked accounts
│   ├── status.js      # Monitor status
│   └── check.js       # Manual check
├── services/
│   ├── database.js    # SQLite database layer
│   ├── instagram.js   # Instagram fetching with fallbacks
│   ├── notification.js # Discord notification handling
│   └── monitor.js     # Periodic monitoring service
├── index.js           # Main bot entry point
└── deploy-commands.js # Command registration

data/
└── bot.db            # SQLite database (auto-created)
```

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Test thoroughly
4. Submit a pull request

## License

MIT License - feel free to use and modify

## Support

- Issues: [GitHub Issues]
- Questions: [Discord Server] (if you have one)

## Limitations

- Instagram's anti-scraping measures may affect reliability
- Public accounts only (private accounts not supported)
- Rate limits apply to all fetching methods
- Some accounts may not be accessible via RSS
- Notifications may be delayed during Instagram API outages

## Alternatives

If RSS Bridge doesn't work for your use case, consider:

- **Third-party APIs:** Apify, ScrapFly, RapidAPI (paid, more reliable)
- **Official Instagram API:** Requires business account (limited features)
- **Custom scraper:** Requires proxies and constant maintenance

## Credits

- Built with [Discord.js](https://discord.js.org/)
- Uses [RSS Bridge](https://github.com/RSS-Bridge/rss-bridge)
- Database: [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)

---

**Note:** This bot is for educational purposes. Always respect Instagram's Terms of Service and rate limits.
