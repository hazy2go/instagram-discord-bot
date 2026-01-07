import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('check')
    .setDescription('Manually check an Instagram account for new posts')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Instagram username to check')
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

  async execute(interaction, { monitor, database }) {
    await interaction.deferReply({ ephemeral: true });

    const username = interaction.options.getString('username').replace('@', '');

    try {
      const account = database.getInstagramAccount(username);

      if (!account) {
        return await interaction.editReply({
          content: `Account @${username} is not being tracked. Use \`/track\` to start tracking it.`
        });
      }

      await interaction.editReply({
        content: `Checking @${username} for new posts...`
      });

      // Force check the account
      await monitor.forceCheckAccount(username);

      const updatedAccount = database.getInstagramAccount(username);

      await interaction.editReply({
        content: `Check completed for @${username}.\n` +
                 `Last post ID: ${updatedAccount.last_post_id || 'None'}\n` +
                 `Last checked: <t:${Math.floor(new Date(updatedAccount.last_checked).getTime() / 1000)}:R>`
      });

    } catch (error) {
      console.error('[Command:Check] Error:', error);
      await interaction.editReply({
        content: `Failed to check @${username}: ${error.message}`
      });
    }
  }
};
