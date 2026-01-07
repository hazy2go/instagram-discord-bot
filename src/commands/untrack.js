import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('untrack')
    .setDescription('Stop tracking an Instagram account')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Instagram username to stop tracking')
        .setRequired(true)
        .setAutocomplete(true))
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Specific channel to stop notifications for (optional)')
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async autocomplete(interaction, { database }) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const settings = database.getAllNotificationSettingsForGuild(interaction.guildId);

    // Get unique usernames
    const usernames = [...new Set(settings.map(s => s.username))];

    const filtered = usernames
      .filter(username => username.toLowerCase().includes(focusedValue))
      .slice(0, 25)
      .map(username => ({ name: `@${username}`, value: username }));

    await interaction.respond(filtered);
  },

  async execute(interaction, { database }) {
    await interaction.deferReply({ ephemeral: true });

    const username = interaction.options.getString('username').replace('@', '');
    const channel = interaction.options.getChannel('channel');

    try {
      const igAccount = database.getInstagramAccount(username);

      if (!igAccount) {
        return await interaction.editReply({
          content: `Account @${username} is not being tracked.`
        });
      }

      if (channel) {
        // Remove specific channel notification
        database.removeNotificationSetting(igAccount.id, interaction.guildId, channel.id);

        await interaction.editReply({
          content: `Stopped sending notifications for @${username} to ${channel}.`
        });
      } else {
        // Remove all notifications for this guild
        const settings = database.getNotificationSettings(igAccount.id);
        const guildSettings = settings.filter(s => s.guild_id === interaction.guildId);

        if (guildSettings.length === 0) {
          return await interaction.editReply({
            content: `No notification settings found for @${username} in this server.`
          });
        }

        for (const setting of guildSettings) {
          database.removeNotificationSetting(igAccount.id, interaction.guildId, setting.channel_id);
        }

        // If no more notification settings exist, deactivate the account
        const remainingSettings = database.getNotificationSettings(igAccount.id);
        if (remainingSettings.length === 0) {
          database.deactivateInstagramAccount(username);
        }

        await interaction.editReply({
          content: `Stopped tracking @${username} in this server (removed ${guildSettings.length} notification setting(s)).`
        });
      }

    } catch (error) {
      console.error('[Command:Untrack] Error:', error);
      await interaction.editReply({
        content: `Failed to untrack @${username}: ${error.message}`
      });
    }
  }
};
