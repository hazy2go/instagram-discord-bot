# Instagram Fetching Strategy - Detailed Explanation

## The Problem You Experienced

You noticed that posts were being detected **hours late** (2+ hours), and sometimes required manual checks to find. This is a common issue with Instagram monitoring bots.

## Why This Happens

### 1. RSS Bridge Caching
**Original strategy relied on RSS Bridge as primary method:**
- RSS Bridge caches Instagram data for 15-60 minutes
- Public instances are heavily loaded and slow to update
- Can be 1-3 hours behind for popular accounts
- Often completely down or rate-limited

### 2. Bibliogram is Dead
**Bibliogram instances are mostly offline in 2026:**
- Community-run service that shut down many instances
- Most remaining instances are unreliable
- Very slow cache updates (30+ min)
- Not a viable fallback anymore

### 3. Wrong Priority Order
**The original code tried slow methods first:**
```
1. RSS Bridge (SLOW, cached)
2. Bibliogram (DEAD)
3. Direct API (FAST, but tried last)
```

This meant you only got fast results if the slow methods failed!

## The Solution - Improved Strategy

### New Priority Order (Fastest First)

```
1. Direct API         → ⚡ REAL-TIME (but rate limited)
2. Web Scraping       → ⚡ REAL-TIME (harder to block)
3. RSS Bridge         → 🐌 CACHED (backup only)
4. Bibliogram         → 💀 DEAD (last resort)
```

### Key Improvements

#### 1. Direct API First
```javascript
// Instagram's official JSON endpoint
https://www.instagram.com/api/v1/users/web_profile_info/?username=nike
```
**Pros:**
- Real-time data (no caching)
- Fastest response (~500ms)
- Official Instagram endpoint

**Cons:**
- Rate limited (~200 requests/hour per IP)
- Can get blocked if overused

**When to use:** First attempt, works great for 20-30 accounts

#### 2. Web Scraping (NEW METHOD)
```javascript
// Scrape HTML page and extract JSON
https://www.instagram.com/${username}/
```
**Pros:**
- Real-time data (no RSS caching)
- Harder for Instagram to block (looks like normal browser)
- Extracts data from embedded JSON in HTML
- More reliable than RSS

**Cons:**
- Slightly slower than API (~1-2 seconds)
- Requires parsing HTML
- May break if Instagram changes HTML structure

**When to use:** When Direct API fails or is rate limited

#### 3. Smart Method Caching
```javascript
// Remembers which method worked last time
this.lastSuccessfulMethod.set(username, 'Direct API');
```

The bot now **remembers** which fetch method worked for each account and tries that first on the next check. This makes subsequent checks much faster!

#### 4. Better Headers
```javascript
// Realistic browser headers to avoid detection
'User-Agent': 'Mozilla/5.0 Chrome/131.0.0.0 Safari/537.36',
'Accept': 'text/html,application/xhtml+xml...',
'Sec-Fetch-Dest': 'document',
// ... more headers
```

Makes requests look like a real browser, reducing the chance of being blocked.

## How It Works Now

### Check Flow

```
User posts on Instagram
         ↓
[5-10 minutes later]
         ↓
Bot check cycle starts
         ↓
┌─────────────────────────────────────┐
│  Try Direct API (instagram.com)     │ ← REAL-TIME ⚡
│  200 req/hour limit                 │
└─────────────────────────────────────┘
         ↓
    Worked? ✓
         ↓ No, rate limited
┌─────────────────────────────────────┐
│  Try Web Scraping                   │ ← REAL-TIME ⚡
│  Scrape HTML page                   │
└─────────────────────────────────────┘
         ↓
    Worked? ✓
         ↓ No, blocked
┌─────────────────────────────────────┐
│  Try RSS Bridge                     │ ← CACHED 🐌
│  May be 15-60 min behind            │
└─────────────────────────────────────┘
         ↓
    Worked? ✓
         ↓ No, down
┌─────────────────────────────────────┐
│  Try Bibliogram (last resort)       │ ← MOSTLY DEAD 💀
└─────────────────────────────────────┘
         ↓
    Success! Send notification
```

## Detection Speed Comparison

### Before (Original Code)
```
Instagram Post Published:  00:00 (0 min)
RSS Bridge updates cache:  00:45 (45 min) ← SLOW!
Bot checks RSS Bridge:     00:50 (50 min)
Notification sent:         00:50 (50 min)

RESULT: 50-120 minute delay ❌
```

### After (Improved Code)
```
Instagram Post Published:  00:00 (0 min)
Bot checks Direct API:     00:05 (5 min) ← NEXT CHECK CYCLE
Notification sent:         00:05 (5 min)

RESULT: 5-10 minute delay ✅
```

## Duplicate Detection

### Problem: Double Notifications
You mentioned wanting to ensure we don't double-post. The bot already has this covered:

1. **Database tracking** - Every notified post is saved to `post_history` table
2. **Pre-check** - Before notifying, checks if post already exists in history
3. **ID comparison** - Compares `last_post_id` in database vs. fetched post ID

```javascript
// Double-check before notifying
const alreadyNotified = this.db.hasPostBeenNotified(account.id, latestPost.id);

if (!alreadyNotified) {
  // Send notification
  // Save to history
}
```

### How We Store Previous Post

```sql
-- instagram_accounts table
last_post_id TEXT  -- The shortcode of the last post we saw

-- post_history table
post_id TEXT       -- All posts we've notified about (last 30 days)
```

This dual-tracking ensures:
- We know what the latest post was (`last_post_id`)
- We never notify twice (`post_history`)

## Better Logging

### Before
```
[Monitor] Checking @nike...
[Monitor] No new posts for @nike
```

### After
```
[Monitor] Checking @nike... (last post: ABC123xyz)
[Instagram] Trying last successful method (Direct API) for @nike
[Instagram] ✓ Success with Direct API for @nike
[Monitor] Latest post for @nike: DEF456abc (https://instagram.com/p/DEF456abc/)
[Monitor] 🆕 NEW POST detected for @nike!
[Monitor]    Old: ABC123xyz
[Monitor]    New: DEF456abc
[Monitor]    URL: https://instagram.com/p/DEF456abc/
[Monitor]    Published: 2026-01-07T22:30:00.000Z
[Monitor] 📢 Sending notifications to 2 channel(s)...
[Monitor] ✓ Notifications sent: 2/2 successful
[Monitor] Check completed for @nike in 1247ms
```

Much more detailed! You can see:
- Which method worked
- Exact post IDs being compared
- Timing information
- Success/failure for each channel

## Configuration Tips

### For Fast Detection (Recommended)

```env
CHECK_INTERVAL=5  # Check every 5 minutes
```

**Best for:** 1-30 accounts
**Detection time:** 5-10 minutes
**Risk:** Low (Direct API + Web Scrape handle this well)

### For Many Accounts (30-50)

```env
CHECK_INTERVAL=10  # Check every 10 minutes
```

**Best for:** 30-50 accounts
**Detection time:** 10-15 minutes
**Risk:** Medium (may hit rate limits, but web scrape will take over)

### For Lots of Accounts (50+)

```env
CHECK_INTERVAL=15  # Check every 15 minutes
```

**Best for:** 50+ accounts
**Detection time:** 15-20 minutes
**Risk:** Lower rate limit issues
**Consider:** Self-hosting RSS Bridge or using proxies

## Rate Limit Handling

### What Happens When Rate Limited?

The Direct API has a limit of ~200 requests/hour per IP.

**Math for 20 accounts at 5-min intervals:**
- Checks per hour: 20 accounts × 12 cycles = 240 requests
- Rate limit: ~200 requests/hour
- **Result:** Will hit limit after ~50 minutes

**But don't worry!** When Direct API is rate limited:
1. Bot automatically switches to Web Scraping
2. Web Scraping is harder to rate limit
3. You still get real-time data
4. RSS Bridge is final fallback

### Avoiding Rate Limits

1. **Don't check too frequently** - 5 minutes is optimal
2. **Use Web Scrape** - Already configured as fallback
3. **Self-host RSS Bridge** - For stable backup method
4. **Use proxies** - Rotate IPs for 50+ accounts

## Testing Your Setup

### Check if improvements are working

1. **Track a test account:**
   ```
   /track username:nike channel:#test
   ```

2. **Force a check:**
   ```
   /check username:nike
   ```

3. **Watch the logs:**
   ```bash
   npm start

   # You should see:
   [Instagram] Attempting direct API fetch for @nike
   [Instagram] ✓ Success with Direct API for @nike
   [Monitor] Check completed for @nike in 1247ms
   ```

4. **Verify which method worked:**
   The logs will show exactly which fetch method succeeded!

### Troubleshooting

**If you see "No posts found":**
- Account might be private
- Account might not exist
- All fetch methods failed (check logs for details)

**If detection is still slow:**
- Check your `CHECK_INTERVAL` (should be 5-10)
- Look for rate limit errors in logs
- Verify bot is actually running (check `/status`)

**If getting rate limited:**
- Increase `CHECK_INTERVAL` to 10-15
- Self-host RSS Bridge
- Reduce number of accounts

## Summary

### What Changed

✅ **Direct API first** - Real-time data, not cached RSS
✅ **Web scraping added** - Reliable real-time fallback
✅ **Smart caching** - Remembers what worked per account
✅ **Better headers** - Looks more like a real browser
✅ **Improved logging** - See exactly what's happening
✅ **Detailed diagnostics** - Track timing and success rates

### Expected Results

- **Detection time:** 5-10 minutes (was 30-120 minutes)
- **Reliability:** Much higher with 4 fallback methods
- **No duplicates:** Database tracking prevents double notifications
- **Better visibility:** Detailed logs show what's working

### Still Having Issues?

1. Check logs for which method is working
2. Use `/check username` to force immediate check
3. Use `/status` to see overall bot health
4. Look for rate limit errors in console
5. Try increasing `CHECK_INTERVAL` if seeing many errors

---

**The improvements ensure you get notifications within 5-10 minutes of posts, not hours!** 🚀
