import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('list')
    .setDescription('List all tracked Instagram accounts in this server')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction, { database }) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const settings = database.getAllNotificationSettingsForGuild(interaction.guildId);

      if (settings.length === 0) {
        return await interaction.editReply({
          content: 'No Instagram accounts are being tracked in this server.'
        });
      }

      // Group settings by username
      const grouped = settings.reduce((acc, setting) => {
        if (!acc[setting.username]) {
          acc[setting.username] = [];
        }
        acc[setting.username].push(setting);
        return acc;
      }, {});

      const embed = new EmbedBuilder()
        .setColor('#E1306C')
        .setTitle('Tracked Instagram Accounts')
        .setDescription(`Monitoring ${Object.keys(grouped).length} Instagram account(s)`)
        .setTimestamp();

      // Add field for each account
      for (const [username, accountSettings] of Object.entries(grouped)) {
        let fieldValue = '';

        for (const setting of accountSettings) {
          const channel = await interaction.guild.channels.fetch(setting.channel_id).catch(() => null);
          const channelMention = channel ? `<#${setting.channel_id}>` : `Unknown (${setting.channel_id})`;

          fieldValue += `• ${channelMention}`;

          if (setting.mention_role_id) {
            fieldValue += ` (mentions <@&${setting.mention_role_id}>)`;
          }

          fieldValue += '\n';

          if (setting.custom_message && setting.custom_message !== 'New post from {username}: {url}') {
            fieldValue += `  Message: \`${setting.custom_message.substring(0, 50)}${setting.custom_message.length > 50 ? '...' : ''}\`\n`;
          }
        }

        embed.addFields({
          name: `@${username}`,
          value: fieldValue || 'No channels configured',
          inline: false
        });
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('[Command:List] Error:', error);
      await interaction.editReply({
        content: `Failed to list tracked accounts: ${error.message}`
      });
    }
  }
};
