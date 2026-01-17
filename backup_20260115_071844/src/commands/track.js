import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('track')
    .setDescription('Start tracking an Instagram account')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Instagram username (without @)')
        .setRequired(true))
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to send notifications to')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('message')
        .setDescription('Custom notification message (use {username}, {url}, {title})')
        .setRequired(false))
    .addRoleOption(option =>
      option.setName('mention')
        .setDescription('Role to mention when posting')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, { database, instagram, notification }) {
    await interaction.deferReply({ ephemeral: true });

    const username = interaction.options.getString('username').replace('@', '');
    const channel = interaction.options.getChannel('channel');
    const customMessage = interaction.options.getString('message');
    const mentionRole = interaction.options.getRole('mention');

    try {
      // Validate Instagram account by trying to fetch posts
      await interaction.editReply(`Checking Instagram account @${username}...`);

      const posts = await instagram.fetchRecentPosts(username);

      if (posts.length === 0) {
        return await interaction.editReply({
          content: `Could not find or access Instagram account @${username}. Please verify:\n` +
                   `• The username is correct\n` +
                   `• The account is public\n` +
                   `• The account exists`
        });
      }

      // Add to database
      database.addInstagramAccount(username, username);
      const igAccount = database.getInstagramAccount(username);

      // Add notification settings
      database.addNotificationSetting(
        igAccount.id,
        interaction.guildId,
        channel.id,
        customMessage,
        mentionRole?.id
      );

      // Set initial last_post_id to avoid notification spam
      if (posts[0]) {
        database.updateLastPostId(igAccount.id, posts[0].id);
      }

      // Send success message
      let responseMessage = `Successfully started tracking @${username}!\n\n` +
                          `• **Channel:** ${channel}\n` +
                          `• **Check Interval:** Every ${process.env.CHECK_INTERVAL || 5} minutes\n`;

      if (customMessage) {
        responseMessage += `• **Custom Message:** ${customMessage}\n`;
      }

      if (mentionRole) {
        responseMessage += `• **Mention Role:** ${mentionRole}\n`;
      }

      responseMessage += `\nNew posts will be detected within ${process.env.CHECK_INTERVAL || 5} minutes.`;

      await interaction.editReply({ content: responseMessage });

      // Send test notification
      await notification.sendTestNotification(channel.id, username);

    } catch (error) {
      console.error('[Command:Track] Error:', error);
      await interaction.editReply({
        content: `Failed to track @${username}: ${error.message}`
      });
    }
  }
};
