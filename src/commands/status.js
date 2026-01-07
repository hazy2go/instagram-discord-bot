import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check monitoring status and bot health')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, { monitor, database }) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const status = monitor.getStatus();
      const allAccounts = database.getAllActiveAccounts();

      const embed = new EmbedBuilder()
        .setColor(status.isRunning ? '#00FF00' : '#FF0000')
        .setTitle('Instagram Monitor Status')
        .setTimestamp();

      // Overall status
      embed.addFields({
        name: 'Monitor Status',
        value: status.isRunning ? '🟢 Running' : '🔴 Stopped',
        inline: true
      });

      embed.addFields({
        name: 'Check Interval',
        value: `Every ${status.checkInterval} minutes`,
        inline: true
      });

      embed.addFields({
        name: 'Accounts Monitored',
        value: `${status.accountsMonitored} total`,
        inline: true
      });

      // Server-specific stats
      const guildSettings = database.getAllNotificationSettingsForGuild(interaction.guildId);
      const uniqueAccounts = [...new Set(guildSettings.map(s => s.username))];

      embed.addFields({
        name: 'This Server',
        value: `Tracking ${uniqueAccounts.length} account(s)\n${guildSettings.length} notification(s) configured`,
        inline: false
      });

      // Recent checks
      if (allAccounts.length > 0) {
        const recentChecks = allAccounts
          .slice(0, 5)
          .map(acc => {
            const lastChecked = new Date(acc.last_checked);
            const minutesAgo = Math.floor((Date.now() - lastChecked) / 60000);
            return `• @${acc.username}: ${minutesAgo} min ago`;
          })
          .join('\n');

        embed.addFields({
          name: 'Recent Checks',
          value: recentChecks || 'No checks yet',
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('[Command:Status] Error:', error);
      await interaction.editReply({
        content: `Failed to get status: ${error.message}`
      });
    }
  }
};
