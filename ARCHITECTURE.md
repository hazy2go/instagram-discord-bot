# Architecture Overview

## System Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         Discord Bot (Node.js)                    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Discord    │      │  Instagram   │      │   Database   │
│   Commands   │      │   Monitor    │      │  (SQLite)    │
│              │      │              │      │              │
│ • track      │      │ • Cron Job   │      │ • Accounts   │
│ • untrack    │      │ • Check Loop │      │ • Settings   │
│ • list       │      │ • Post Check │      │ • History    │
│ • status     │      │              │      │              │
│ • check      │      │              │      │              │
│ • update     │      │              │      │              │
└──────────────┘      └──────────────┘      └──────────────┘
        │                       │
        │                       │
        └───────────┬───────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │  Notification Service │
        │                       │
        │ • Build Embeds        │
        │ • Send to Channels    │
        │ • Role Mentions       │
        └───────────────────────┘
```

## Instagram Fetching Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    Instagram Service                             │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────┐
                    │  Try RSS Bridge   │ ◄─── Primary Method
                    └───────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
              ┌─────────┐           ┌─────────┐
              │ Success │           │  Failed │
              └─────────┘           └─────────┘
                    │                       │
                    │                       ▼
                    │           ┌───────────────────┐
                    │           │ Try Bibliogram    │ ◄─── Fallback 1
                    │           └───────────────────┘
                    │                       │
                    │           ┌───────────┴───────────┐
                    │           │                       │
                    │           ▼                       ▼
                    │     ┌─────────┐           ┌─────────┐
                    │     │ Success │           │  Failed │
                    │     └─────────┘           └─────────┘
                    │           │                       │
                    │           │                       ▼
                    │           │           ┌───────────────────┐
                    │           │           │ Try Direct API    │ ◄─── Fallback 2
                    │           │           └───────────────────┘
                    │           │                       │
                    └───────────┴───────────┬───────────┘
                                            │
                                            ▼
                                    ┌──────────────┐
                                    │ Return Posts │
                                    └──────────────┘
```

## Monitoring Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                         Bot Starts                               │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │  Initialize Services  │
                    │  - Database           │
                    │  - Instagram          │
                    │  - Notification       │
                    │  - Monitor            │
                    └───────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │   Start Cron Job      │
                    │   (Every N minutes)   │
                    └───────────────────────┘
                                │
                ┌───────────────┴───────────────┐
                │                               │
                ▼                               ▼
    ┌────────────────────┐         ┌────────────────────┐
    │  Periodic Check    │◄────────┤  Wait N Minutes    │
    └────────────────────┘         └────────────────────┘
                │
                ▼
    ┌────────────────────────────────────────────┐
    │  For Each Active Instagram Account:        │
    │                                             │
    │  1. Fetch latest post                      │
    │  2. Compare with last_post_id              │
    │  3. If new post:                           │
    │     - Check if already notified            │
    │     - Get notification settings            │
    │     - Send to all configured channels      │
    │     - Update database                      │
    │  4. Add 2-3 second delay                   │
    │  5. Continue to next account               │
    └────────────────────────────────────────────┘
                │
                └──────► (Loop continues)
```

## Command Flow Example: `/track`

```
User types: /track username:nike channel:#sneakers
                │
                ▼
    ┌───────────────────────┐
    │  Discord receives     │
    │  command              │
    └───────────────────────┘
                │
                ▼
    ┌───────────────────────┐
    │  Bot validates        │
    │  - Username provided  │
    │  - Channel valid      │
    │  - User has perms     │
    └───────────────────────┘
                │
                ▼
    ┌───────────────────────┐
    │  Defer reply          │
    │  (processing...)      │
    └───────────────────────┘
                │
                ▼
    ┌───────────────────────┐
    │  Instagram Service    │
    │  Fetch posts for      │
    │  @nike                │
    └───────────────────────┘
                │
        ┌───────┴───────┐
        │               │
        ▼               ▼
   ┌────────┐      ┌────────┐
   │Success │      │ Failed │
   └────────┘      └────────┘
        │               │
        │               ▼
        │       ┌───────────────┐
        │       │ Reply: Error  │
        │       └───────────────┘
        │
        ▼
┌──────────────────────┐
│  Database Service    │
│  - Add IG account    │
│  - Add notification  │
│  - Set last_post_id  │
└──────────────────────┘
        │
        ▼
┌──────────────────────┐
│  Notification        │
│  Send test message   │
└──────────────────────┘
        │
        ▼
┌──────────────────────┐
│  Reply: Success!     │
│  Shows settings      │
└──────────────────────┘
```

## Database Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                     instagram_accounts                           │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)                                                          │
│ username (UNIQUE)                                                │
│ display_name                                                     │
│ last_post_id                                                     │
│ last_checked                                                     │
│ active                                                           │
└─────────────────────────────────────────────────────────────────┘
                    │
                    │ 1
                    │
                    │ N
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                   notification_settings                          │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)                                                          │
│ instagram_account_id (FK) ────────────────────┐                 │
│ guild_id                                      │                 │
│ channel_id                                    │                 │
│ custom_message                                │                 │
│ mention_role_id                               │                 │
│ active                                        │                 │
└───────────────────────────────────────────────┼─────────────────┘
                                                │
                                                │
        ┌───────────────────────────────────────┘
        │
        │ 1
        │
        │ N
        ▼
┌─────────────────────────────────────────────────────────────────┐
│                        post_history                              │
├─────────────────────────────────────────────────────────────────┤
│ id (PK)                                                          │
│ instagram_account_id (FK)                                        │
│ post_id                                                          │
│ post_url                                                         │
│ notified_at                                                      │
└─────────────────────────────────────────────────────────────────┘
```

## Service Dependencies

```
┌─────────────────────────────────────────────────────────────────┐
│                          index.js                                │
│                     (Main Entry Point)                           │
└─────────────────────────────────────────────────────────────────┘
                    │
                    │ creates & manages
                    │
    ┌───────────────┼───────────────┬──────────────┐
    │               │               │              │
    ▼               ▼               ▼              ▼
┌────────┐   ┌────────────┐   ┌────────────┐   ┌────────┐
│Database│   │ Instagram  │   │Notification│   │Monitor │
│Service │   │  Service   │   │  Service   │   │Service │
└────────┘   └────────────┘   └────────────┘   └────────┘
    │               │                │              │
    │               │                │              │
    │               │                │              │
    │         ┌─────┼────────────────┼──────────────┘
    │         │     │                │
    │         │     │                │
    ▼         ▼     ▼                ▼
┌─────────────────────────────────────────┐
│           Commands (6 total)             │
│                                         │
│  All commands receive services object   │
│  with access to all 4 services          │
└─────────────────────────────────────────┘
```

## File Organization

```
instagram-discord-bot/
│
├── Core Configuration
│   ├── package.json ─────────── Dependencies & scripts
│   ├── .env.example ─────────── Config template
│   ├── .gitignore ───────────── Git exclusions
│   └── LICENSE ──────────────── MIT License
│
├── Documentation
│   ├── README.md ────────────── Complete guide (400+ lines)
│   ├── QUICKSTART.md ────────── Fast setup (5 min)
│   ├── EXAMPLES.md ──────────── Usage examples
│   ├── ARCHITECTURE.md ──────── This file
│   └── PROJECT_SUMMARY.md ───── Technical overview
│
├── src/
│   │
│   ├── Entry Points
│   │   ├── index.js ─────────── Main bot startup
│   │   └── deploy-commands.js ─ Register slash commands
│   │
│   ├── commands/ ────────────── Discord slash commands
│   │   ├── track.js ─────────── Add tracking
│   │   ├── untrack.js ───────── Remove tracking
│   │   ├── list.js ──────────── List tracked
│   │   ├── status.js ────────── Health status
│   │   ├── check.js ─────────── Manual check
│   │   └── update.js ────────── Update settings
│   │
│   └── services/ ────────────── Core business logic
│       ├── database.js ──────── SQLite operations
│       ├── instagram.js ─────── Fetch posts
│       ├── notification.js ──── Send to Discord
│       └── monitor.js ───────── Periodic checking
│
└── data/ (created at runtime)
    └── bot.db ───────────────── SQLite database
```

## Key Design Decisions

### 1. SQLite Over PostgreSQL
**Reason:** Simplicity for single-instance deployment
- No separate database server required
- File-based, easy backups
- Perfect for <100 accounts
- Better-sqlite3 is synchronous (simpler code)

**Trade-off:** Not suitable for distributed systems

### 2. Cron-Based Monitoring
**Reason:** Reliability and simplicity
- Node-cron is battle-tested
- Easy to configure intervals
- Graceful shutdown support
- No external dependencies

**Alternative considered:** Webhook-based (not available for Instagram)

### 3. Multiple Fetch Strategies
**Reason:** Maximize uptime and reliability
- RSS Bridge (best for most accounts)
- Bibliogram (community fallback)
- Direct API (last resort)

**Trade-off:** More complex code, but much more reliable

### 4. Slash Commands Only
**Reason:** Modern Discord best practice
- Official Discord recommendation
- Better UX than prefix commands
- Auto-permission management
- Built-in autocomplete support

### 5. Service Layer Architecture
**Reason:** Maintainability and testability
- Separation of concerns
- Easy to mock for testing
- Clear dependencies
- Reusable across commands

## Performance Considerations

### Memory Management
- SQLite uses minimal memory (in-process)
- Cron job releases resources between runs
- No memory leaks in long-running processes

### Network Efficiency
- Sequential checking prevents rate limits
- 2-3 second delays between accounts
- Timeout on all HTTP requests (15s)
- Reuses HTTP client (connection pooling)

### Database Optimization
- Indexes on frequently queried columns
- UNIQUE constraints prevent duplicates
- Periodic cleanup of old post history
- Synchronous operations (better-sqlite3)

### Concurrency Model
- Single-threaded Node.js
- Async/await for I/O operations
- Cron ensures one check at a time
- No race conditions in database writes

## Error Handling Strategy

### Graceful Degradation
1. If account fails → continue with next account
2. If RSS Bridge fails → try Bibliogram
3. If all fetch methods fail → log and continue
4. If Discord channel unavailable → skip and log

### Persistence
- Database writes are atomic
- Failed checks update last_checked timestamp
- Post history prevents duplicate notifications
- Monitor continues despite individual failures

### User Feedback
- Deferred replies for long operations
- Clear error messages in Discord
- Detailed console logging
- Status command for health checks

## Scalability Path

### Current Capacity
- 20-30 accounts comfortably
- Single server instance
- 5-minute check interval
- SQLite database

### Scaling to 50-100 Accounts
- Self-host RSS Bridge
- Increase check interval to 10 minutes
- Use proxy rotation
- Monitor resource usage

### Scaling to 100+ Accounts
- Multiple bot instances (different Discord bots)
- PostgreSQL instead of SQLite
- Queue system (Bull, RabbitMQ)
- Separate monitoring service
- Dedicated scraping infrastructure

## Security Model

### Bot Token Security
- Environment variables only
- Never committed to git
- .gitignore includes .env

### Permission System
- Slash commands default to "Manage Server"
- Optional role-based restrictions
- Channel permissions respected

### Instagram Data
- Public accounts only
- No authentication stored
- Respects rate limits
- Educational use disclaimer

### Database Security
- No password storage
- Discord IDs only (no PII)
- File permissions on bot.db
- Regular backups recommended

---

**This architecture supports:**
- ✅ Fast detection (5-10 minutes)
- ✅ Reboot safety
- ✅ Multiple accounts
- ✅ Customizable notifications
- ✅ Production deployment
- ✅ Easy maintenance
