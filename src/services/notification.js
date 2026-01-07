import { EmbedBuilder } from 'discord.js';

class NotificationService {
  constructor(client, database) {
    this.client = client;
    this.db = database;
  }

  /**
   * Send notification about a new Instagram post
   */
  async sendNotification(post, instagramAccount, notificationSettings) {
    const results = [];

    for (const setting of notificationSettings) {
      try {
        const channel = await this.client.channels.fetch(setting.channel_id);

        if (!channel) {
          console.error(`[Notification] Channel ${setting.channel_id} not found`);
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

        // Create embed
        const embed = this.createEmbed(post, instagramAccount);

        // Send notification
        await channel.send({
          content: mentionText + message,
          embeds: [embed]
        });

        console.log(`[Notification] Sent notification for @${instagramAccount.username} to channel ${setting.channel_id}`);
        results.push({ success: true, channelId: setting.channel_id });

      } catch (error) {
        console.error(`[Notification] Failed to send to channel ${setting.channel_id}:`, error.message);
        results.push({ success: false, channelId: setting.channel_id, error: error.message });
      }
    }

    return results;
  }

  /**
   * Build notification message with template variables
   */
  buildMessage(template, username, displayName, url, title) {
    if (!template) {
      template = 'New post from {username}: {url}';
    }

    return template
      .replace(/{username}/g, username)
      .replace(/{display_name}/g, displayName || username)
      .replace(/{url}/g, url)
      .replace(/{title}/g, title || '');
  }

  /**
   * Create Discord embed for Instagram post
   */
  createEmbed(post, instagramAccount) {
    const embed = new EmbedBuilder()
      .setColor('#E1306C') // Instagram brand color
      .setAuthor({
        name: `@${instagramAccount.username}`,
        iconURL: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Instagram_icon.png/64px-Instagram_icon.png',
        url: `https://www.instagram.com/${instagramAccount.username}/`
      })
      .setTitle('New Instagram Post')
      .setURL(post.url)
      .setTimestamp(post.publishedAt);

    // Add description if available (truncate to 300 chars)
    if (post.description) {
      const description = post.description.length > 300
        ? post.description.substring(0, 297) + '...'
        : post.description;
      embed.setDescription(description);
    }

    // Add thumbnail if available
    if (post.thumbnail) {
      embed.setImage(post.thumbnail);
    }

    return embed;
  }

  /**
   * Send a test notification
   */
  async sendTestNotification(channelId, username) {
    try {
      const channel = await this.client.channels.fetch(channelId);

      if (!channel) {
        throw new Error('Channel not found');
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

      await channel.send({ content: `Test notification for @${username}`, embeds: [embed] });

      return { success: true };
    } catch (error) {
      console.error('[Notification] Test notification failed:', error.message);
      return { success: false, error: error.message };
    }
  }
}

export default NotificationService;
