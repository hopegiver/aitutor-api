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
      const response = await fetch(`${this.baseUrl}/${videoId}/downloads`, {
        headers: {
          'Authorization': `Bearer ${this.apiToken}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Stream API error: ${errorData.errors?.[0]?.message || response.statusText}`);
      }

      const data = await response.json();

      const audioDownload = data.result.default?.find(item =>
        item.type === 'audio' || item.type === 'mp3'
      );

      if (!audioDownload) {
        throw new Error('Audio download URL not available');
      }

      return audioDownload.url;

    } catch (error) {
      console.error('Error getting audio download URL:', error);
      throw error;
    }
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