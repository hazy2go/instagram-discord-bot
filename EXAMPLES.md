# Usage Examples

Real-world examples of how to use the Instagram Discord Bot.

## Example 1: Track Your Brand's Instagram

Track your company's Instagram and notify your marketing team:

```
/track username:yourcompany channel:#marketing-alerts mention:@Marketing Team
```

## Example 2: Monitor Competitor Posts

Set up multiple competitors with custom messages:

```
/track username:competitor1 channel:#competitor-watch message:🔍 Competitor alert: {username} posted {url}

/track username:competitor2 channel:#competitor-watch message:🔍 Competitor alert: {username} posted {url}

/track username:competitor3 channel:#competitor-watch message:🔍 Competitor alert: {username} posted {url}
```

## Example 3: Influencer Partnerships

Track influencers you're working with:

```
/track username:influencer1 channel:#influencer-posts message:✨ New post from {display_name}! Check it out: {url} mention:@Social Team
```

## Example 4: Multi-Channel Setup

Send different accounts to different channels:

```
# Main brand account → General announcements
/track username:mainbrand channel:#announcements mention:@everyone

# Product updates account → Product channel
/track username:mainbrand_products channel:#products mention:@Product Team

# Behind-the-scenes account → Internal channel
/track username:mainbrand_bts channel:#internal
```

## Example 5: Event Coverage

Track an event's Instagram during a conference:

```
/track username:conference2024 channel:#event-live message:📸 New post from {username}: {url} mention:@Attendees
```

After the event:

```
/untrack username:conference2024
```

## Example 6: Fashion Brand Monitoring

Track fashion brands for new drops:

```
/track username:nike channel:#sneaker-drops message:👟 NEW NIKE DROP! {url} mention:@Sneakerheads

/track username:adidas channel:#sneaker-drops message:👟 NEW ADIDAS DROP! {url} mention:@Sneakerheads

/track username:supreme channel:#streetwear message:🔥 SUPREME POSTED! {url} mention:@Hypebeasts
```

## Example 7: News Organizations

Monitor news outlets:

```
/track username:cnn channel:#news-feed message:📰 CNN: {url}
/track username:bbc channel:#news-feed message:📰 BBC: {url}
/track username:nytimes channel:#news-feed message:📰 NYT: {url}
```

## Example 8: Artist/Musician Updates

Track your favorite artists:

```
/track username:taylorswift channel:#music-updates message:🎵 Taylor Swift posted! {url} mention:@Swifties

/track username:theweeknd channel:#music-updates message:🎵 The Weeknd posted! {url} mention:@Music Fans
```

## Example 9: E-commerce Store

Monitor product posts from your Instagram shop:

```
/track username:yourstore channel:#sales-alerts message:🛍️ New product on Instagram! {url} Check comments for pricing! mention:@Sales Team
```

## Example 10: Sports Teams

Track team accounts:

```
/track username:lakers channel:#lakers-news message:🏀 Lakers update: {url} mention:@Lakers Fans

/track username:nba channel:#basketball message:🏀 NBA posted: {url}
```

## Checking Your Setup

After setting up multiple accounts:

```
# See all tracked accounts
/list

# Check monitoring status
/status

# Force check a specific account
/check username:nike
```

## Updating Settings

Change notification settings without removing and re-adding:

```
# Update message for an existing tracked account
/update username:nike channel:#sneakers message:🔥 JUST DROPPED: {url}

# Change mention role
/update username:nike channel:#sneakers mention:@VIP Members
```

## Managing Multiple Channels

Same account, different channels with different settings:

```
# Public channel with basic notification
/track username:yourcompany channel:#announcements message:New post: {url}

# Private channel with detailed notification
/track username:yourcompany channel:#marketing-internal message:📊 New post from {username} - Analyze engagement! {url} mention:@Marketing
```

## Template Variables Reference

Use these in your custom messages:

- `{username}` - Instagram username (e.g., "nike")
- `{display_name}` - Display name if available (e.g., "Nike")
- `{url}` - Direct link to post
- `{title}` - Post caption preview (first ~100 chars)

### Example Messages

**Minimal:**
```
{url}
```

**Standard:**
```
New post from {username}: {url}
```

**Branded:**
```
🔔 {display_name} just posted on Instagram! Check it out: {url}
```

**With CTA:**
```
🚨 ALERT: New post from {username}!

{url}

Like, comment, and share! 💪
```

**Detailed:**
```
📸 Instagram Update

Account: {username}
Post: {url}

{title}

React with 👍 if you've engaged!
```

## Best Practices

### For Marketing Teams

1. Create dedicated channels for different account types
2. Use role mentions to alert specific teams
3. Set custom messages that include action items
4. Monitor competitors separately from your own accounts

### For Community Servers

1. Don't spam - be selective about which accounts to track
2. Use clear, concise messages
3. Consider a dedicated channel for social media updates
4. Use role mentions so only interested members are notified

### For Personal Use

1. Track accounts you care about most
2. Set check interval to 5-10 minutes for balance
3. Use different channels for different interests
4. Review and prune inactive accounts regularly

## Troubleshooting Common Scenarios

### Account seems delayed

```
# Force a manual check
/check username:theaccount

# Check overall status
/status
```

### Want to temporarily pause notifications

```
# Untrack the account
/untrack username:theaccount

# Track again later when needed
/track username:theaccount channel:#thechannel
```

### Change which channel receives notifications

```
# Remove from old channel
/untrack username:theaccount channel:#old-channel

# Add to new channel
/track username:theaccount channel:#new-channel
```

### Test before going live

```
# Set up tracking
/track username:testaccount channel:#test-channel

# Verify it's working
/check username:testaccount

# Check the test channel for notification
# Once confirmed working, set up real accounts
```

## Advanced: Multiple Servers

The bot can work across multiple Discord servers simultaneously. Each server's tracking is independent:

**Server A:**
```
/track username:brand channel:#updates
```

**Server B:**
```
/track username:brand channel:#social-media message:Custom message for this server
```

Both servers will track the same Instagram account but with independent settings.

## Rate Limit Awareness

If tracking many accounts (20+):

1. Consider increasing `CHECK_INTERVAL` to 10-15 minutes
2. Self-host RSS Bridge for better reliability
3. Monitor status regularly with `/status`
4. Spread accounts across multiple bots if needed (100+ accounts)

## Maintenance Commands

```
# Weekly: Check what you're tracking
/list

# Weekly: Verify bot health
/status

# Monthly: Clean up unused accounts
/untrack username:unused_account

# After adding many accounts: Force check one to verify
/check username:newaccount
```
