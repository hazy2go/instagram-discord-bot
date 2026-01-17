import { EmbedBuilder } from 'discord.js';
import { createLogger } from '../utils/logger.js';
import { retryWithBackoff, extractInstagramPostId } from '../utils/helpers.js';
import metrics from '../utils/metrics.js';
import {
  DISCORD_RETRY_ATTEMPTS,
  DISCORD_RETRY_BASE_DELAY_MS,
  DISCORD_MESSAGE_HISTORY_LIMIT,
  DISCORD_EMBED_MAX_LENGTH
} from '../utils/constants.js';

const logger = createLogger('Notification');

/**
 * Notification Service
 * Handles sending Discord notifications for Instagram posts
 */
class NotificationService {
  constructor(client, database) {
    this.client = client;
    this.db = database;
  }

  /**
   * Check if a post has already been shared in the channel
   * Uses three-layer protection:
   * 1. Database history check (permanent record)
   * 2. Discord message check (last N messages)
   * 3. Timestamp validation (handled in monitor.js)
   * @param {Object} channel - Discord channel
   * @param {string} postUrl - Instagram post URL
   * @param {number} instagramAccountId - Instagram account ID
   * @returns {Promise<boolean>} True if post was already shared
   */
  async isPostAlreadyShared(channel, postUrl, instagramAccountId) {
    try {
      // Extract post ID from URL (e.g., https://www.instagram.com/p/ABC123/ or /reel/ABC123/)
      const postId = extractInstagramPostId(postUrl);

      if (!postId) {
        logger.warn('Could not extract post ID from URL', { postUrl });
        return false;
      }

      logger.debug('Checking for duplicate post', {
        postId,
        channelId: channel.id,
        instagramAccountId
      });

      // Layer 1: Check database history (permanent record across reboots)
      const inDatabase = this.db.hasPostBeenNotified(instagramAccountId, postId);
      if (inDatabase) {
        logger.info('Post found in database history', {
          postId,
          instagramAccountId
        });
        return true;
      }

      // Layer 2: Check recent Discord messages (catches manual posts)
      const messages = await channel.messages.fetch({ limit: DISCORD_MESSAGE_HISTORY_LIMIT });

      // Check if any message contains the post URL or post ID
      for (const message of messages.values()) {
        if (message.content.includes(postUrl) || message.content.includes(postId)) {
          logger.info('Post found in recent Discord messages', {
            postId,
            channelId: channel.id
          });
          return true;
        }
      }

      logger.debug('Post not found in history or recent messages', { postId });
      return false;
    } catch (error) {
      logger.error('Error checking for duplicate post', {
        error: error.message,
        postUrl,
        channelId: channel?.id
      });
      // On error, assume it's not a duplicate to avoid blocking legitimate posts
      return false;
    }
  }

  /**
   * Send notification about a new Instagram post
   * @param {Object} post - Post object
   * @param {Object} instagramAccount - Instagram account object
   * @param {Array} notificationSettings - Array of notification settings
   * @returns {Promise<Array>} Array of result objects
   */
  async sendNotification(post, instagramAccount, notificationSettings) {
    logger.info('Sending notifications', {
      username: instagramAccount.username,
      postId: post.id,
      channels: notificationSettings.length
    });

    const results = [];

    for (const setting of notificationSettings) {
      try {
        logger.debug('Fetching Discord channel', {
          channelId: setting.channel_id,
          username: instagramAccount.username
        });

        const channel = await retryWithBackoff(
          async () => {
            const ch = await this.client.channels.fetch(setting.channel_id);
            if (!ch) {
              throw new Error('Channel not found');
            }
            return ch;
          },
          DISCORD_RETRY_ATTEMPTS,
          DISCORD_RETRY_BASE_DELAY_MS
        );

        // Check if channel is text-based
        if (!channel.isTextBased()) {
          logger.error('Channel is not text-based', {
            channelId: setting.channel_id,
            channelType: channel.type
          });
          results.push({
            success: false,
            channelId: setting.channel_id,
            error: 'Not a text channel'
          });
          metrics.recordNotificationFailed();
          continue;
        }

        // Check if post was already shared in this channel
        const alreadyShared = await this.isPostAlreadyShared(
          channel,
          post.url,
          instagramAccount.id
        );

        if (alreadyShared) {
          logger.info('Skipping duplicate post', {
            username: instagramAccount.username,
            channelId: setting.channel_id,
            postId: post.id
          });
          results.push({
            success: true,
            channelId: setting.channel_id,
            skipped: true,
            reason: 'duplicate'
          });
          metrics.recordNotificationSkipped();
          continue;
        }

        // Build custom message
        const message = this.buildMessage(
          setting.custom_message,
          instagramAccount.username,
          instagramAccount.display_name,
          post.url,
          post.title
        );

        // Add role mention if configured
        const mentionText = setting.mention_role_id ? `<@&${setting.mention_role_id}> ` : '';

        // Create embed with post content
        const embed = this.createEmbed(post, instagramAccount);

        // Send notification with retry logic
        await retryWithBackoff(
          async () => {
            await channel.send({
              content: `${mentionText}${message}\n${post.url}`,
              embeds: [embed]
            });
          },
          DISCORD_RETRY_ATTEMPTS,
          DISCORD_RETRY_BASE_DELAY_MS
        );

        logger.info('Notification sent successfully', {
          username: instagramAccount.username,
          channelId: setting.channel_id,
          postId: post.id
        });

        results.push({ success: true, channelId: setting.channel_id });
        metrics.recordNotificationSent();

      } catch (error) {
        logger.error('Failed to send notification', {
          username: instagramAccount.username,
          channelId: setting.channel_id,
          error: error.message,
          stack: error.stack
        });

        results.push({
          success: false,
          channelId: setting.channel_id,
          error: error.message
        });
        metrics.recordNotificationFailed();
      }
    }

    return results;
  }

  /**
   * Build notification message with template variables
   * @param {string} template - Message template
   * @param {string} username - Instagram username
   * @param {string} displayName - Display name
   * @param {string} url - Post URL
   * @param {string} title - Post title
   * @returns {string} Formatted message
   */
  buildMessage(template, username, displayName, url, title) {
    if (!template) {
      template = 'Hey **@{username}** just posted a new shot! Go check it out!';
    }

    const message = template
      .replace(/{username}/g, username)
      .replace(/{display_name}/g, displayName || username)
      .replace(/{url}/g, url)
      .replace(/{title}/g, title || '');

    logger.debug('Built notification message', {
      username,
      templateLength: template.length,
      messageLength: message.length
    });

    return message;
  }

  /**
   * Create Discord embed for Instagram post
   * @param {Object} post - Post object
   * @param {Object} instagramAccount - Instagram account object
   * @returns {EmbedBuilder} Discord embed
   */
  createEmbed(post, instagramAccount) {
    const embed = new EmbedBuilder()
      .setColor('#E1306C') // Instagram brand color
      .setAuthor({
        name: `${instagramAccount.display_name || instagramAccount.username} (@${instagramAccount.username})`,
        iconURL: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Instagram_icon.png/64px-Instagram_icon.png',
        url: `https://www.instagram.com/${instagramAccount.username}/`
      })
      .setFooter({
        text: 'Instagram',
        iconURL: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Instagram_icon.png/64px-Instagram_icon.png'
      })
      .setTimestamp(post.publishedAt);

    // Add description if available (truncate to Discord limit)
    if (post.description) {
      const description = post.description.length > DISCORD_EMBED_MAX_LENGTH
        ? post.description.substring(0, DISCORD_EMBED_MAX_LENGTH - 3) + '...'
        : post.description;
      embed.setDescription(description);
    }

    // Add image if available
    if (post.thumbnail) {
      embed.setImage(post.thumbnail);
    }

    logger.debug('Created Discord embed', {
      username: instagramAccount.username,
      postId: post.id,
      hasDescription: !!post.description,
      hasThumbnail: !!post.thumbnail
    });

    return embed;
  }

  /**
   * Send a test notification
   * @param {string} channelId - Discord channel ID
   * @param {string} username - Instagram username
   * @returns {Promise<Object>} Result object
   */
  async sendTestNotification(channelId, username) {
    logger.info('Sending test notification', { channelId, username });

    try {
      const channel = await retryWithBackoff(
        async () => {
          const ch = await this.client.channels.fetch(channelId);
          if (!ch) {
            throw new Error('Channel not found');
          }
          return ch;
        },
        DISCORD_RETRY_ATTEMPTS,
        DISCORD_RETRY_BASE_DELAY_MS
      );

      // Check if channel is text-based
      if (!channel.isTextBased()) {
        throw new Error(`Channel is not a text channel (type: ${channel.type})`);
      }

      const embed = new EmbedBuilder()
        .setColor('#E1306C')
        .setAuthor({
          name: `@${username}`,
          iconURL: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Instagram_icon.png/64px-Instagram_icon.png',
          url: `https://www.instagram.com/${username}/`
        })
        .setTitle('Test Notification')
        .setDescription('This is a test notification for Instagram post monitoring.')
        .setTimestamp();

      await retryWithBackoff(
        async () => {
          await channel.send({
            content: `Test notification for @${username}`,
            embeds: [embed]
          });
        },
        DISCORD_RETRY_ATTEMPTS,
        DISCORD_RETRY_BASE_DELAY_MS
      );

      logger.info('Test notification sent successfully', { channelId, username });
      return { success: true };

    } catch (error) {
      logger.error('Test notification failed', {
        channelId,
        username,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }
}

export default NotificationService;
