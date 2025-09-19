import { WebTVChannelScanner, type WebTVChannelInfo, type WebTVVideoInfo } from './webtv-scanner.js';
import type { WebTVConfig } from '../config/schema.js';

export interface WebTVSelectionResult {
  selected_channels: WebTVChannelInfo[];
  total_size_gb: number;
  remaining_space_gb: number;
  all_required_included: boolean;
  selection_strategy_used: string;
  warnings: string[];
  channel_breakdown: {
    required: WebTVChannelInfo[];
    optional: WebTVChannelInfo[];
    excluded: WebTVChannelInfo[];
  };
}

export class WebTVSpaceManager {
  private scanner: WebTVChannelScanner;

  constructor() {
    this.scanner = new WebTVChannelScanner();
  }

  /**
   * Perform intelligent channel selection based on WebTV configuration
   * Uses random video selection for diverse content variety
   */
  async selectChannels(config: WebTVConfig): Promise<WebTVSelectionResult> {
    console.log(`🎯 Starting WebTV selection for ${config.reserved_space_gb}GB target`);
    
    // Find all configured channels
    const channelMatches = await this.scanner.findConfiguredChannels(config.channels);
    
    const result: WebTVSelectionResult = {
      selected_channels: [],
      total_size_gb: 0,
      remaining_space_gb: config.reserved_space_gb,
      all_required_included: true,
      selection_strategy_used: config.selection_strategy,
      warnings: [],
      channel_breakdown: {
        required: [],
        optional: [],
        excluded: [],
      },
    };

    // Separate required and optional channels
    const requiredChannels: WebTVChannelInfo[] = [];
    const optionalChannels: WebTVChannelInfo[] = [];
    const missingChannels: string[] = [];

    for (const configChannel of config.channels) {
      const matchedChannel = channelMatches.get(configChannel.name);
      
      if (!matchedChannel) {
        missingChannels.push(configChannel.name);
        if (configChannel.priority === 'required') {
          result.all_required_included = false;
          result.warnings.push(`Required channel not found: ${configChannel.name}`);
        }
        continue;
      }

      // Apply max_size_gb limit if specified
      let channelToAdd = matchedChannel;
      if (configChannel.max_size_gb && matchedChannel.size_gb > configChannel.max_size_gb) {
        result.warnings.push(`Channel ${configChannel.name} (${matchedChannel.size_gb.toFixed(1)}GB) exceeds max size limit (${configChannel.max_size_gb}GB) - using full size`);
      }

      if (configChannel.priority === 'required') {
        requiredChannels.push(channelToAdd);
      } else {
        optionalChannels.push(channelToAdd);
      }
    }

    console.log(`📋 Found ${requiredChannels.length} required and ${optionalChannels.length} optional channels`);

    // Step 1: Add all required channels first (copy entirely)
    let currentSize = 0;
    for (const channel of requiredChannels) {
      // Required channels are copied entirely
      channel.is_required = true;
      channel.copy_mode = 'entire';
      channel.selected_size_gb = channel.size_gb;

      result.selected_channels.push(channel);
      result.channel_breakdown.required.push(channel);
      currentSize += channel.size_gb;
      console.log(`✅ Added required: ${channel.name} (${channel.size_gb.toFixed(1)}GB, entire channel, avg: ${channel.avg_video_size_gb?.toFixed(2)}GB/video)`);
    }

    console.log(`📊 Required channels total: ${currentSize.toFixed(1)}GB`);

    // Check if required channels exceed target
    if (currentSize > config.reserved_space_gb) {
      result.warnings.push(`Required channels (${currentSize.toFixed(1)}GB) exceed target space (${config.reserved_space_gb}GB)`);
      result.total_size_gb = currentSize;
      result.remaining_space_gb = 0;
      result.channel_breakdown.excluded = [...optionalChannels];
      return result;
    }

    // Step 2: Add optional channels using intelligent selection (partial selection allowed)
    const remainingSpace = config.reserved_space_gb - currentSize;
    console.log(`🎯 ${remainingSpace.toFixed(1)}GB remaining for optional channels`);

    if (remainingSpace > 0 && optionalChannels.length > 0) {
      const selectedOptional = await this.selectOptimalChannels(optionalChannels, remainingSpace, config.allow_partial_channels);

      for (const channel of selectedOptional) {
        result.selected_channels.push(channel);
        result.channel_breakdown.optional.push(channel);
        currentSize += channel.selected_size_gb || channel.size_gb;

        if (channel.copy_mode === 'partial' && channel.selected_videos) {
          console.log(`✅ Added optional (partial): ${channel.name} (${channel.selected_videos.length} videos, ${channel.selected_size_gb?.toFixed(1)}GB of ${channel.size_gb.toFixed(1)}GB total)`);
        } else {
          console.log(`✅ Added optional (entire): ${channel.name} (${channel.size_gb.toFixed(1)}GB, avg: ${channel.avg_video_size_gb?.toFixed(2)}GB/video)`);
        }
      }

      // Mark excluded channels
      const selectedOptionalNames = new Set(selectedOptional.map(c => c.name));
      result.channel_breakdown.excluded = optionalChannels.filter(c => !selectedOptionalNames.has(c.name));
    } else {
      result.channel_breakdown.excluded = [...optionalChannels];
    }

    result.total_size_gb = currentSize;
    result.remaining_space_gb = config.reserved_space_gb - currentSize;

    console.log(`🎉 Selection complete: ${result.selected_channels.length} channels, ${currentSize.toFixed(1)}GB total`);
    
    return result;
  }

  /**
   * Select optimal channels from available options, favoring larger documentaries
   * Uses fair space allocation: splits available space equally between optional channels
   * For optional channels, implements partial selection when allowPartial is true
   */
  private async selectOptimalChannels(
    availableChannels: WebTVChannelInfo[],
    maxSpace: number,
    allowPartial: boolean
  ): Promise<WebTVChannelInfo[]> {
    console.log(`📊 Selecting optimal channels with ${maxSpace.toFixed(1)}GB available space (partial=${allowPartial})`);

    const selected: WebTVChannelInfo[] = [];

    if (!allowPartial) {
      // Simple whole-channel selection (legacy behavior)
      return this.selectWholeChannels(availableChannels, maxSpace);
    }

    if (availableChannels.length === 0) {
      console.log(`⚠️  No optional channels available for selection`);
      return selected;
    }

    // Calculate fair allocation per channel
    const spacePerChannel = maxSpace / availableChannels.length;
    console.log(`⚖️  Fair allocation: ${spacePerChannel.toFixed(1)}GB per channel (${availableChannels.length} channels)`);

    let totalUsedSpace = 0;

    // Process each channel independently with its allocated space
    for (const channel of availableChannels) {
      console.log(`\n🔍 Processing ${channel.name} with ${spacePerChannel.toFixed(1)}GB allocation...`);

      // Get all videos for this channel
      const videos = await this.scanner.getChannelVideos(channel.path);
      channel.videos = videos;

      if (videos.length === 0) {
        console.log(`⚠️  No videos found in ${channel.name}, skipping`);
        continue;
      }

      // Videos are randomly shuffled for diverse selection from getChannelVideos
      console.log(`📹 Found ${videos.length} videos in ${channel.name}, total: ${videos.reduce((sum, v) => sum + v.size_gb, 0).toFixed(1)}GB`);

      // Select videos that fit within this channel's allocation
      const selectedVideos: WebTVVideoInfo[] = [];
      let channelUsedSpace = 0;

      for (const video of videos) {
        if (channelUsedSpace + video.size_gb <= spacePerChannel) {
          selectedVideos.push(video);
          channelUsedSpace += video.size_gb;
          console.log(`✅ Selected video: ${channel.name}/${video.name} (${video.size_gb.toFixed(2)}GB) - ${(spacePerChannel - channelUsedSpace).toFixed(1)}GB remaining in allocation`);
        } else {
          // Check if we can add one more video even if it goes slightly over the allocation
          // This helps utilize space more efficiently
          const wouldExceedBy = (channelUsedSpace + video.size_gb) - spacePerChannel;
          if (wouldExceedBy <= 1.0 && selectedVideos.length > 0) { // Allow up to 1GB overage
            selectedVideos.push(video);
            channelUsedSpace += video.size_gb;
            console.log(`✅ Selected video (overage): ${channel.name}/${video.name} (${video.size_gb.toFixed(2)}GB) - ${wouldExceedBy.toFixed(1)}GB over allocation`);
            break; // Stop after allowing one overage
          } else {
            console.log(`⏭️  Skipped video: ${channel.name}/${video.name} (${video.size_gb.toFixed(2)}GB) - would exceed allocation by ${wouldExceedBy.toFixed(1)}GB`);
          }
        }
      }

      if (selectedVideos.length > 0) {
        // Create channel selection result
        const channelResult = { ...channel };
        channelResult.selected_videos = selectedVideos;
        channelResult.selected_size_gb = channelUsedSpace;
        channelResult.is_required = false;
        channelResult.copy_mode = 'partial';

        selected.push(channelResult);
        totalUsedSpace += channelUsedSpace;

        console.log(`✅ Added optional (partial): ${channel.name} (${selectedVideos.length} videos, ${channelUsedSpace.toFixed(1)}GB of ${channel.size_gb.toFixed(1)}GB total)`);
      } else {
        console.log(`⚠️  No videos selected for ${channel.name} - all videos too large for allocation`);
      }
    }

    console.log(`🎉 Partial selection complete: ${selected.length} channels with videos selected, ${totalUsedSpace.toFixed(1)}GB total`);

    return selected;
  }

  /**
   * Legacy whole-channel selection for when partial selection is disabled
   */
  private selectWholeChannels(availableChannels: WebTVChannelInfo[], maxSpace: number): WebTVChannelInfo[] {
    // Sort channels by a composite score that favors larger average video sizes
    const scoredChannels = availableChannels.map(channel => ({
      channel,
      score: (channel.avg_video_size_gb || 0) * 10 +
             (channel.size_gb / Math.max(channel.media_file_count, 1)) * 2 +
             channel.size_gb * 0.1
    })).sort((a, b) => b.score - a.score);

    const selected: WebTVChannelInfo[] = [];
    let usedSpace = 0;

    for (const { channel } of scoredChannels) {
      if (usedSpace + channel.size_gb <= maxSpace) {
        channel.is_required = false;
        channel.copy_mode = 'entire';
        channel.selected_size_gb = channel.size_gb;

        selected.push(channel);
        usedSpace += channel.size_gb;
        console.log(`✅ Selected entire channel: ${channel.name} (${channel.size_gb.toFixed(1)}GB)`);
      } else {
        console.log(`⏭️  Skipped channel: ${channel.name} (${channel.size_gb.toFixed(1)}GB) - would exceed space limit`);
      }
    }

    return selected;
  }

  /**
   * Get a preview of what would be selected without actually performing selection
   */
  async previewSelection(config: WebTVConfig): Promise<{
    estimated_size: number;
    channel_count: number;
    missing_channels: string[];
  }> {
    const channelMatches = await this.scanner.findConfiguredChannels(config.channels);
    
    let estimatedSize = 0;
    let channelCount = 0;
    const missingChannels: string[] = [];

    for (const configChannel of config.channels) {
      const matchedChannel = channelMatches.get(configChannel.name);
      
      if (!matchedChannel) {
        missingChannels.push(configChannel.name);
        continue;
      }

      if (configChannel.priority === 'required') {
        estimatedSize += matchedChannel.size_gb;
        channelCount++;
      }
    }

    return {
      estimated_size: estimatedSize,
      channel_count: channelCount,
      missing_channels: missingChannels,
    };
  }
}
