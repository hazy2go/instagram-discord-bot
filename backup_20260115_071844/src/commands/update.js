import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('update')
    .setDescription('Update notification settings for a tracked account')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Instagram username')
        .setRequired(true)
        .setAutocomplete(true))
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to update settings for')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('message')
        .setDescription('New custom notification message (use {username}, {url}, {title})')
        .setRequired(false))
    .addRoleOption(option =>
      option.setName('mention')
        .setDescription('New role to mention (or none to remove)')
        .setRequired(false))
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

  async execute(interaction, { database }) {
    await interaction.deferReply({ ephemeral: true });

    const username = interaction.options.getString('username').replace('@', '');
    const channel = interaction.options.getChannel('channel');
    const customMessage = interaction.options.getString('message');
    const mentionRole = interaction.options.getRole('mention');

    try {
      const igAccount = database.getInstagramAccount(username);

      if (!igAccount) {
        return await interaction.editReply({
          content: `Account @${username} is not being tracked. Use \`/track\` first.`
        });
      }

      // Update notification settings
      database.addNotificationSetting(
        igAccount.id,
        interaction.guildId,
        channel.id,
        customMessage,
        mentionRole?.id
      );

      let responseMessage = `Updated notification settings for @${username} in ${channel}:\n\n`;

      if (customMessage) {
        responseMessage += `• **New Message:** ${customMessage}\n`;
      }

      if (mentionRole) {
        responseMessage += `• **Mention Role:** ${mentionRole}\n`;
      }

      if (!customMessage && !mentionRole) {
        responseMessage += 'No changes specified. Use the `message` or `mention` options to update settings.';
      }

      await interaction.editReply({ content: responseMessage });

    } catch (error) {
      console.error('[Command:Update] Error:', error);
      await interaction.editReply({
        content: `Failed to update settings for @${username}: ${error.message}`
      });
    }
  }
};
