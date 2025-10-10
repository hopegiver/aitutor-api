export class StreamService {
  constructor(accountId, apiToken) {
    this.accountId = accountId;
    this.apiToken = apiToken;
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`;
  }

  async uploadVideoFromUrl(videoUrl, metadata = {}) {
    try {
      const response = await fetch(`${this.baseUrl}/copy`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          url: videoUrl,
          meta: {
            name: metadata.name || 'Transcription Video',
            ...metadata
          },
          allowedOrigins: ['*'],
          requireSignedURLs: false
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Stream API error: ${errorData.errors?.[0]?.message || response.statusText}`);
      }

      const data = await response.json();
      return data.result;

    } catch (error) {
      console.error('Error uploading video to Stream:', error);
      throw error;
    }
  }

  async getVideoStatus(videoId) {
    try {
      const response = await fetch(`${this.baseUrl}/${videoId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Stream API error: ${errorData.errors?.[0]?.message || response.statusText}`);
      }

      const data = await response.json();
      return data.result;

    } catch (error) {
      console.error('Error getting video status:', error);
      throw error;
    }
  }

  async getAudioDownloadUrl(videoId) {
    try {
      // Method 1: Try downloads API first
      const response = await fetch(`${this.baseUrl}/${videoId}/downloads`, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Downloads API response:', JSON.stringify(data, null, 2));

        const audioDownload = data.result.default?.find(item =>
          item.type === 'audio' || item.type === 'mp3' || item.type === 'mp4'
        );

        if (audioDownload) {
          console.log('Found audio download:', audioDownload);
          return audioDownload.url;
        }
      }

      // Method 2: Try to extract audio from HLS stream
      console.log('Downloads API failed, trying HLS audio extraction...');
      return await this.extractAudioFromHLS(videoId);

    } catch (error) {
      console.error('Error getting audio download URL:', error);
      throw error;
    }
  }

  async extractAudioFromHLS(videoId) {
    try {
      // Get video status to access HLS URL
      const videoStatus = await this.getVideoStatus(videoId);
      const hlsUrl = videoStatus.playback?.hls;

      if (!hlsUrl) {
        throw new Error('HLS playback URL not available');
      }

      console.log('HLS URL found:', hlsUrl);

      // Fetch HLS manifest to find audio streams
      const manifestResponse = await fetch(hlsUrl);
      if (!manifestResponse.ok) {
        throw new Error('Failed to fetch HLS manifest');
      }

      const manifestText = await manifestResponse.text();
      console.log('HLS Manifest preview:', manifestText.substring(0, 500) + '...');

      // Look for audio-only streams in the manifest
      const lines = manifestText.split('\n');
      let audioStreamUrl = null;

      // Method 1: Look for EXT-X-MEDIA with TYPE=AUDIO
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.startsWith('#EXT-X-MEDIA:') && line.includes('TYPE=AUDIO')) {
          console.log('Found audio media entry:', line);

          // Extract URI from the audio media line
          const uriMatch = line.match(/URI="([^"]+)"/);
          if (uriMatch) {
            const audioUri = uriMatch[1];
            audioStreamUrl = audioUri.startsWith('http') ? audioUri : new URL(audioUri, hlsUrl).href;
            console.log('Extracted audio stream URL:', audioStreamUrl);
            break;
          }
        }
      }

      // Method 2: If no dedicated audio stream, look for lowest bitrate video stream
      if (!audioStreamUrl) {
        console.log('No dedicated audio stream found, looking for lowest bitrate stream...');

        let lowestBandwidth = Infinity;
        let lowestBandwidthUrl = null;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();

          if (line.startsWith('#EXT-X-STREAM-INF')) {
            const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
            if (bandwidthMatch) {
              const bandwidth = parseInt(bandwidthMatch[1]);
              const nextLine = lines[i + 1]?.trim();

              if (nextLine && !nextLine.startsWith('#') && bandwidth < lowestBandwidth) {
                lowestBandwidth = bandwidth;
                lowestBandwidthUrl = nextLine.startsWith('http') ? nextLine : new URL(nextLine, hlsUrl).href;
              }
            }
          }
        }

        if (lowestBandwidthUrl) {
          audioStreamUrl = lowestBandwidthUrl;
          console.log(`Found lowest bitrate stream (${lowestBandwidth} bps):`, audioStreamUrl);
        }
      }

      if (audioStreamUrl) {
        return audioStreamUrl;
      }

      // Method 3: If no audio-only stream, try to request audio extraction
      console.log('No audio-only stream found, trying audio extraction request...');
      return await this.requestAudioExtraction(videoId);

    } catch (error) {
      console.error('Error extracting audio from HLS:', error);
      throw error;
    }
  }

  async requestAudioExtraction(videoId) {
    try {
      // Try to use Stream's clip/download features for audio extraction
      const response = await fetch(`${this.baseUrl}/${videoId}/clip`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          clippedFromVideoUID: videoId,
          startTimeSeconds: 0,
          endTimeSeconds: 9999, // Full duration
          allowedOrigins: ['*'],
          requireSignedURLs: false,
          meta: {
            name: `Audio extraction from ${videoId}`,
            type: 'audio-extraction'
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.log('Clip API failed:', errorData);
        throw new Error(`Clip API error: ${errorData.errors?.[0]?.message || response.statusText}`);
      }

      const clipData = await response.json();
      const clipId = clipData.result.uid;

      console.log('Created clip for audio extraction:', clipId);

      // Wait for clip processing and try to get audio from it
      await this.waitForProcessing(clipId, 120000, 5000); // 2 minutes max

      return await this.getAudioDownloadUrl(clipId);

    } catch (error) {
      console.error('Error requesting audio extraction:', error);

      // Method 4: Fallback to original HLS URL (no longer used with Stream AI captions)
      const videoStatus = await this.getVideoStatus(videoId);
      const hlsUrl = videoStatus.playback?.hls;

      if (hlsUrl) {
        console.log('Falling back to HLS URL (deprecated with Stream AI captions):', hlsUrl);
        return hlsUrl;
      }

      throw new Error('All audio extraction methods failed');
    }
  }

  // AI Caption Generation Methods
  async generateCaptions(videoId, language = 'ko') {
    try {
      console.log(`Starting AI caption generation for video ${videoId} in language: ${language}`);

      const response = await fetch(`${this.baseUrl}/${videoId}/captions/${language}/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Caption generation error: ${errorData.errors?.[0]?.message || response.statusText}`);
      }

      const data = await response.json();
      console.log('Caption generation initiated:', data.result);

      return data.result;

    } catch (error) {
      console.error('Error generating captions:', error);
      throw error;
    }
  }

  async getCaptionStatus(videoId, language = 'ko') {
    try {
      const response = await fetch(`${this.baseUrl}/${videoId}/captions/${language}`, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Caption status error: ${errorData.errors?.[0]?.message || response.statusText}`);
      }

      const data = await response.json();
      return data.result;

    } catch (error) {
      console.error('Error getting caption status:', error);
      throw error;
    }
  }

  async getCaptionContent(videoId, language = 'ko') {
    try {
      // Get caption file URL
      const captionInfo = await this.getCaptionStatus(videoId, language);

      if (captionInfo.status !== 'ready') {
        throw new Error(`Captions not ready. Current status: ${captionInfo.status}`);
      }

      // Download caption content
      const captionUrl = `${this.baseUrl}/${videoId}/captions/${language}/vtt`;
      const response = await fetch(captionUrl, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to download captions: ${response.statusText}`);
      }

      const captionText = await response.text();
      return {
        language: captionInfo.language,
        label: captionInfo.label,
        status: captionInfo.status,
        content: captionText,
        format: 'vtt'
      };

    } catch (error) {
      console.error('Error getting caption content:', error);
      throw error;
    }
  }

  async waitForCaptions(videoId, language = 'ko', maxWaitTime = 600000, pollInterval = 10000, progressCallback = null) {
    console.log(`Waiting for captions to be generated for video ${videoId}...`);
    const startTime = Date.now();
    let iterationCount = 0;

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const status = await this.getCaptionStatus(videoId, language);
        console.log(`Caption status: ${status.status}`);

        // Update progress periodically
        if (progressCallback && iterationCount % 1 === 0) { // Every iteration (10 seconds)
          const elapsedTime = Date.now() - startTime;
          const progressPercentage = Math.min(70 + (elapsedTime / maxWaitTime) * 15, 84); // 70-84% range
          await progressCallback('generating-captions', progressPercentage, `AI caption generation in progress (${status.status})`);
        }

        if (status.status === 'ready') {
          console.log('✅ Captions are ready!');
          if (progressCallback) {
            await progressCallback('generating-captions', 85, 'AI caption generation completed');
          }
          return status;
        }

        if (status.status === 'error') {
          throw new Error('Caption generation failed');
        }

        await new Promise(resolve => setTimeout(resolve, pollInterval));
        iterationCount++;

      } catch (error) {
        if (error.message.includes('not found')) {
          console.log('Captions not yet started, continuing to wait...');
          if (progressCallback && iterationCount % 1 === 0) {
            const elapsedTime = Date.now() - startTime;
            const progressPercentage = Math.min(70 + (elapsedTime / maxWaitTime) * 15, 84);
            await progressCallback('generating-captions', progressPercentage, 'Waiting for AI caption generation to start');
          }
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          iterationCount++;
        } else {
          throw error;
        }
      }
    }

    throw new Error('Caption generation timeout');
  }

  async deleteVideo(videoId) {
    try {
      const response = await fetch(`${this.baseUrl}/${videoId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.apiToken}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Stream API error: ${errorData.errors?.[0]?.message || response.statusText}`);
      }

      return true;

    } catch (error) {
      console.error('Error deleting video:', error);
      throw error;
    }
  }

  async waitForProcessing(videoId, maxWaitTime = 300000, pollInterval = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.getVideoStatus(videoId);

      if (status.status?.state === 'ready') {
        return status;
      }

      if (status.status?.state === 'error') {
        throw new Error(`Video processing failed: ${status.status.errorReasonText || 'Unknown error'}`);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('Video processing timeout');
  }
}