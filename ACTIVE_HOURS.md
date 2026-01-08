# Active Hours Configuration

Reduce unnecessary API calls and avoid rate limits by only checking Instagram during specific hours when posts are most likely to be published.

## Why Use Active Hours?

1. **Reduce API calls** - Don't waste requests when accounts aren't posting
2. **Avoid rate limits** - Stay under Instagram's rate limits by reducing checks
3. **Save resources** - Lower CPU/network usage during inactive hours
4. **Optimize timing** - Focus checks when your accounts actually post

## Configuration

### .env Settings

```env
# Active Hours Configuration
ACTIVE_HOURS_START=21    # Start checking at 9 PM (21:00)
ACTIVE_HOURS_END=5       # Stop checking at 5 AM (05:00)
ACTIVE_HOURS_TIMEZONE=Asia/Tokyo  # Timezone (JST)
```

### Supported Timezones

Use standard IANA timezone names:

**Common Timezones:**
- `America/New_York` - EST/EDT
- `America/Los_Angeles` - PST/PDT
- `America/Chicago` - CST/CDT
- `Europe/London` - GMT/BST
- `Europe/Paris` - CET/CEST
- `Asia/Tokyo` - JST (Japan)
- `Asia/Seoul` - KST (Korea)
- `Asia/Shanghai` - CST (China)
- `Australia/Sydney` - AEDT/AEST
- `UTC` - Coordinated Universal Time

**Full list:** https://en.wikipedia.org/wiki/List_of_tz_database_time_zones

## How It Works

### Time Window Types

#### 1. Overnight Window (Most Common)
```env
ACTIVE_HOURS_START=21  # 9 PM
ACTIVE_HOURS_END=5     # 5 AM
```

**Active times:**
- 21:00 (9 PM) → 23:59 (11:59 PM) ✅
- 00:00 (12 AM) → 04:59 (4:59 AM) ✅
- 05:00 (5 AM) → 20:59 (8:59 PM) ❌

This covers posts from evening through early morning.

#### 2. Normal Daytime Window
```env
ACTIVE_HOURS_START=9   # 9 AM
ACTIVE_HOURS_END=17    # 5 PM
```

**Active times:**
- 09:00 (9 AM) → 16:59 (4:59 PM) ✅
- 17:00 (5 PM) → 08:59 (8:59 AM) ❌

This covers standard business hours.

#### 3. 24/7 Monitoring (Default)
```env
# Leave empty or comment out to check 24/7
# ACTIVE_HOURS_START=
# ACTIVE_HOURS_END=
```

Bot will check continuously without time restrictions.

## Example Configurations

### Japanese Instagram Accounts (JST)
Most Japanese accounts post between evening and night:

```env
ACTIVE_HOURS_START=18
ACTIVE_HOURS_END=2
ACTIVE_HOURS_TIMEZONE=Asia/Tokyo
```

**Active:** 6 PM - 2 AM JST (8 hours)

### US West Coast Accounts (PST)
Peak posting times for US accounts:

```env
ACTIVE_HOURS_START=8
ACTIVE_HOURS_END=23
ACTIVE_HOURS_TIMEZONE=America/Los_Angeles
```

**Active:** 8 AM - 11 PM PST (15 hours)

### European Business Accounts
Business hours in Central Europe:

```env
ACTIVE_HOURS_START=8
ACTIVE_HOURS_END=18
ACTIVE_HOURS_TIMEZONE=Europe/Paris
```

**Active:** 8 AM - 6 PM CET (10 hours)

### Late Night Party/Club Accounts
Clubs and nightlife accounts:

```env
ACTIVE_HOURS_START=20
ACTIVE_HOURS_END=6
ACTIVE_HOURS_TIMEZONE=America/New_York
```

**Active:** 8 PM - 6 AM EST (10 hours)

## Monitoring Behavior

### During Active Hours
```
[Monitor] Checking all accounts for new posts...
[Monitor] Checking @nike...
[Instagram] ✓ Success with Direct API for @nike
```

Bot operates normally, checking all accounts.

### Outside Active Hours
```
[Monitor] ⏸️  Outside active hours (current: 15:30 Asia/Tokyo). Skipping check.
[Monitor] Active hours: 21:00 - 5:00 Asia/Tokyo
```

Bot **skips the check entirely**, saving API calls.

### Important Notes

1. **Bot stays running** - It doesn't stop, just pauses checks
2. **Cron still fires** - The scheduled task runs, but immediately returns
3. **No API calls** - Instagram is not contacted during inactive hours
4. **Resume automatically** - Checks resume when active hours start

## Checking Status

Use the `/status` command to see current active hours:

```
/status
```

**Response includes:**
```
Active Hours: 21:00 - 5:00 Asia/Tokyo
🟢 Currently Active
```

or

```
Active Hours: 21:00 - 5:00 Asia/Tokyo
⏸️ Currently Paused
```

## Optimization Tips

### Finding Your Optimal Window

1. **Track posting patterns** - When do your accounts usually post?
2. **Start wide** - Begin with a generous window (e.g., 12 hours)
3. **Analyze results** - Check when posts are actually detected
4. **Narrow gradually** - Reduce window to most active hours
5. **Monitor for misses** - Ensure no posts are missed outside window

### Example Analysis

If tracking fashion brands:
- Check their recent posts on Instagram
- Note the posting times (in their timezone)
- Most fashion brands: 8 AM - 8 PM local time
- Set window: `ACTIVE_HOURS_START=8, ACTIVE_HOURS_END=20`

### Rate Limit Benefits

**Without active hours (24/7):**
- 10-minute intervals × 20 accounts = 120 checks/hour
- Full 24 hours = 2,880 checks/day

**With active hours (8 hours):**
- 10-minute intervals × 20 accounts = 120 checks/hour
- Only 8 hours = 960 checks/day
- **67% reduction in API calls!**

## Advanced Scenarios

### Multiple Time Zones
If tracking accounts from different timezones, choose:

1. **Option A: Set to your timezone**
   - Configure when YOU want notifications
   - Example: Your business hours

2. **Option B: Set to majority timezone**
   - If 80% of accounts are Japanese, use JST
   - Optimize for most accounts

3. **Option C: Use UTC with calculated window**
   - Convert all timezones to UTC
   - Set window covering all regions

### Catching Up After Inactive Hours

When active hours resume, the bot:
1. Immediately checks all accounts
2. Detects any posts made during inactive hours
3. Sends notifications normally

**Note:** Notification will be delayed by inactive hours duration. If a post was made at 3 PM and active hours start at 9 PM, notification comes at 9 PM.

### Testing Active Hours

To test the configuration:

1. **Set a short test window:**
   ```env
   # Test: Only active for 1 hour starting now
   ACTIVE_HOURS_START=15  # Current hour
   ACTIVE_HOURS_END=16    # One hour later
   ```

2. **Restart the bot:**
   ```bash
   npm start
   ```

3. **Check logs:**
   - Within active window: Should see checks
   - Outside window: Should see "Outside active hours"

4. **Use `/status`:**
   ```
   /status
   ```
   Check if "Currently Active" or "Currently Paused"

## Troubleshooting

### "Outside active hours" but should be active

**Check timezone:**
```bash
# What time is it in your configured timezone?
TZ=Asia/Tokyo date
```

Compare with your `ACTIVE_HOURS_START` and `ACTIVE_HOURS_END`.

### Bot not respecting active hours

1. **Restart required** - Active hours are loaded on startup
   ```bash
   # Stop bot
   Ctrl+C

   # Start again
   npm start
   ```

2. **Check .env syntax** - Ensure no extra spaces
   ```env
   ACTIVE_HOURS_START=21  # ✓ Correct
   ACTIVE_HOURS_START = 21  # ✗ Wrong (spaces)
   ```

3. **Verify integer values** - Must be 0-23
   ```env
   ACTIVE_HOURS_START=21  # ✓ Correct
   ACTIVE_HOURS_START=9pm  # ✗ Wrong (not a number)
   ```

### Missing posts during inactive hours

**This is expected behavior!** Posts made during inactive hours will be detected when active hours resume, but notifications will be delayed.

**Solutions:**
1. Widen your active hours window
2. Use 24/7 monitoring (remove active hours)
3. Accept delayed notifications as tradeoff for fewer API calls

## Best Practices

### Do's ✅

- Set window based on actual posting patterns
- Leave 1-2 hour buffer on each side
- Monitor for a week before narrowing window
- Use timezone where most accounts are located
- Check `/status` regularly to verify configuration

### Don'ts ❌

- Don't set window too narrow (miss posts)
- Don't use wrong timezone
- Don't forget to restart after .env changes
- Don't expect instant notifications during inactive hours
- Don't configure overlapping with rate limit issues

## Configuration Examples

### Conservative (Safe)
```env
# Wide 12-hour window
ACTIVE_HOURS_START=12  # Noon
ACTIVE_HOURS_END=0     # Midnight
ACTIVE_HOURS_TIMEZONE=Asia/Tokyo
```

### Aggressive (Maximum savings)
```env
# Narrow 6-hour peak window
ACTIVE_HOURS_START=19  # 7 PM
ACTIVE_HOURS_END=1     # 1 AM
ACTIVE_HOURS_TIMEZONE=Asia/Tokyo
```

### Balanced (Recommended)
```env
# 8-hour evening/night window
ACTIVE_HOURS_START=21  # 9 PM
ACTIVE_HOURS_END=5     # 5 AM
ACTIVE_HOURS_TIMEZONE=Asia/Tokyo
```

## Summary

**Benefits:**
- ✅ Reduced API calls (save 50-70%)
- ✅ Lower rate limit risk
- ✅ Resource savings (CPU, network)
- ✅ Focused monitoring during peak times

**Tradeoffs:**
- ⚠️ Posts during inactive hours = delayed notifications
- ⚠️ Need to know posting patterns
- ⚠️ Requires monitoring and adjustment

**Recommendation:**
Start with a **wide window** (12+ hours) and narrow based on actual results over 1-2 weeks.

---

**Your current configuration (from .env):**
```
Active Hours: 21:00 - 5:00 Asia/Tokyo
Window: 8 hours (9 PM to 5 AM JST)
```

This is **perfect for Japanese Instagram accounts** that typically post in the evening/night! 🎌
