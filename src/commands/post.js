import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('post')
    .setDescription('Manually post the latest Instagram post from a tracked account')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Instagram username to post from')
        .setRequired(true)
        .setAutocomplete(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async autocomplete(interaction, { database }) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const settings = database.getAllNotificationSettingsForGuild(interaction.guildId);

    const usernames = [...new Set(settings.map(s => s.username))];

    const filtered = usernames
      .filter(username => username.toLowerCase().includes(focusedValue))
      .slice(0, 25)
      .map(username => ({ name: `@${username}`, value: username }));

    await interaction.respond(filtered);
  },

  async execute(interaction, { instagram, database, notification }) {
    await interaction.deferReply({ ephemeral: true });

    const username = interaction.options.getString('username').replace('@', '');

    try {
      // Check if account is tracked
      const account = database.getInstagramAccount(username);

      if (!account) {
        return await interaction.editReply({
          content: `Account @${username} is not being tracked. Use \`/track\` to start tracking it.`
        });
      }

      // Check if there are notification settings for this guild
      const settings = database.getNotificationSettings(account.id);
      const guildSettings = settings.filter(s => s.guild_id === interaction.guildId);

      if (guildSettings.length === 0) {
        return await interaction.editReply({
          content: `No notification channels configured for @${username} in this server. Use \`/track\` to set up notifications.`
        });
      }

      await interaction.editReply({
        content: `Fetching latest post from @${username}...`
      });

      // Fetch the latest post
      const latestPost = await instagram.getLatestPost(username);

      if (!latestPost) {
        return await interaction.editReply({
          content: `Could not fetch posts from @${username}. The account may be private or there may be an issue with the Instagram service.`
        });
      }

      // Send notification to all configured channels
      const results = await notification.sendNotification(latestPost, account, guildSettings);

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      let responseMessage = `Successfully posted latest content from @${username} to ${successCount} channel(s).`;
      if (failCount > 0) {
        responseMessage += `\n⚠️ Failed to post to ${failCount} channel(s).`;
      }

      await interaction.editReply({
        content: responseMessage
      });

    } catch (error) {
      console.error('[Command:Post] Error:', error);
      await interaction.editReply({
        content: `Failed to post from @${username}: ${error.message}`
      });
    }
  }
};
