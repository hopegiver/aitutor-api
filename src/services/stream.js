/**
 * Cloudflare Stream Service
 * Optimized for AI caption generation and subtitle processing
 */
export class StreamService {
  constructor(accountId, apiToken) {
    this.accountId = accountId;
    this.apiToken = apiToken;
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`;
  }

  // ===============================
  // Core Stream Operations
  // ===============================

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

  // ===============================
  // AI Caption Operations
  // ===============================

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

  // ===============================
  // Subtitle Processing Management
  // ===============================

  extractPlainText(vttContent) {
    if (!vttContent) return '';

    return vttContent
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        // Skip empty lines, WebVTT headers, timestamps, and style tags
        return trimmed.length > 0 &&
               !trimmed.startsWith('WEBVTT') &&
               !trimmed.includes('-->') &&
               !/^\d+$/.test(trimmed) &&
               !trimmed.startsWith('<') &&
               !trimmed.startsWith('NOTE') &&
               !trimmed.startsWith('STYLE') &&
               !trimmed.startsWith('Region:');
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  extractDurationFromVTT(vttContent) {
    if (!vttContent) return 0;

    const lines = vttContent.split('\n');
    let lastTimestamp = '00:00:00.000';

    for (const line of lines) {
      const timestampMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
      if (timestampMatch) {
        lastTimestamp = timestampMatch[2];
      }
    }

    // Convert timestamp to seconds
    const [hours, minutes, secondsWithMs] = lastTimestamp.split(':');
    const [seconds, milliseconds] = secondsWithMs.split('.');

    return (parseInt(hours) * 3600) +
           (parseInt(minutes) * 60) +
           parseInt(seconds) +
           (parseInt(milliseconds) / 1000);
  }

  convertVTTToSegments(vttContent) {
    if (!vttContent) return [];

    const lines = vttContent.split('\n');
    const segments = [];
    let currentSegment = null;

    for (const line of lines) {
      const timestampMatch = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);

      if (timestampMatch) {
        // Start new segment
        if (currentSegment) {
          segments.push(currentSegment);
        }

        currentSegment = {
          start: this.timestampToSeconds(timestampMatch[1]),
          end: this.timestampToSeconds(timestampMatch[2]),
          text: ''
        };
      } else if (currentSegment && line.trim() &&
                 !line.trim().startsWith('WEBVTT') &&
                 !/^\d+$/.test(line.trim()) &&
                 !line.trim().startsWith('NOTE') &&
                 !line.trim().startsWith('STYLE')) {
        // Add text to current segment
        if (currentSegment.text) {
          currentSegment.text += ' ';
        }
        currentSegment.text += line.trim();
      }
    }

    // Add the last segment
    if (currentSegment) {
      segments.push(currentSegment);
    }

    return segments.filter(segment => segment.text.trim().length > 0);
  }

  timestampToSeconds(timestamp) {
    const [hours, minutes, secondsWithMs] = timestamp.split(':');
    const [seconds, milliseconds] = secondsWithMs.split('.');

    return (parseInt(hours) * 3600) +
           (parseInt(minutes) * 60) +
           parseInt(seconds) +
           (parseInt(milliseconds) / 1000);
  }

  // Map language codes to Stream AI supported languages
  mapLanguageCode(language) {
    const languageMap = {
      'ko-KR': 'ko',
      'ko': 'ko',
      'en-US': 'en',
      'en': 'en',
      'ja-JP': 'ja',
      'ja': 'ja',
      'zh-CN': 'zh',
      'zh': 'zh',
      'es-ES': 'es',
      'es': 'es',
      'fr-FR': 'fr',
      'fr': 'fr',
      'de-DE': 'de',
      'de': 'de',
      'it-IT': 'it',
      'it': 'it',
      'pt-PT': 'pt',
      'pt': 'pt',
      'ru-RU': 'ru',
      'ru': 'ru',
      'pl': 'pl',
      'cs': 'cs',
      'nl': 'nl'
    };

    return languageMap[language] || language.split('-')[0] || 'en';
  }
}