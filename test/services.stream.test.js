/**
 * Stream Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StreamService } from '../src/services/stream.js';

describe('StreamService', () => {
  let streamService;
  const mockAccountId = 'test-account-123';
  const mockApiToken = 'test-token-456';

  beforeEach(() => {
    streamService = new StreamService(mockAccountId, mockApiToken);

    // Mock global fetch
    global.fetch = vi.fn();

    // Mock console.error to avoid noise in tests
    vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with account ID and API token', () => {
      expect(streamService.accountId).toBe(mockAccountId);
      expect(streamService.apiToken).toBe(mockApiToken);
      expect(streamService.baseUrl).toBe(`https://api.cloudflare.com/client/v4/accounts/${mockAccountId}/stream`);
    });
  });

  describe('uploadVideoFromUrl', () => {
    it('should upload video with basic metadata', async () => {
      const mockResult = { uid: 'video-123', status: { state: 'pending' } };
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ result: mockResult })
      };

      global.fetch.mockResolvedValue(mockResponse);

      const videoUrl = 'https://example.com/video.mp4';
      const result = await streamService.uploadVideoFromUrl(videoUrl);

      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.cloudflare.com/client/v4/accounts/${mockAccountId}/stream/copy`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${mockApiToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: videoUrl,
            meta: {
              name: 'Transcription Video'
            },
            allowedOrigins: ['*'],
            requireSignedURLs: false
          })
        }
      );

      expect(result).toEqual(mockResult);
    });

    it('should upload video with custom metadata', async () => {
      const mockResult = { uid: 'video-456' };
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ result: mockResult })
      };

      global.fetch.mockResolvedValue(mockResponse);

      const videoUrl = 'https://example.com/video.mp4';
      const metadata = {
        name: 'Custom Video Name',
        description: 'Test video for transcription',
        tags: ['test', 'transcription']
      };

      await streamService.uploadVideoFromUrl(videoUrl, metadata);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            url: videoUrl,
            meta: {
              name: 'Custom Video Name',
              description: 'Test video for transcription',
              tags: ['test', 'transcription']
            },
            allowedOrigins: ['*'],
            requireSignedURLs: false
          })
        })
      );
    });

    it('should handle API errors with error details', async () => {
      const errorResponse = {
        ok: false,
        statusText: 'Bad Request',
        json: vi.fn().mockResolvedValue({
          errors: [{ message: 'Invalid video URL' }]
        })
      };

      global.fetch.mockResolvedValue(errorResponse);

      await expect(streamService.uploadVideoFromUrl('invalid-url'))
        .rejects.toThrow('Stream API error: Invalid video URL');
    });

    it('should handle API errors without error details', async () => {
      const errorResponse = {
        ok: false,
        statusText: 'Internal Server Error',
        json: vi.fn().mockResolvedValue({})
      };

      global.fetch.mockResolvedValue(errorResponse);

      await expect(streamService.uploadVideoFromUrl('https://example.com/video.mp4'))
        .rejects.toThrow('Stream API error: Internal Server Error');
    });

    it('should handle network errors', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      await expect(streamService.uploadVideoFromUrl('https://example.com/video.mp4'))
        .rejects.toThrow('Network error');
    });
  });

  describe('getVideoStatus', () => {
    it('should retrieve video status successfully', async () => {
      const mockResult = {
        uid: 'video-123',
        status: { state: 'ready' },
        duration: 120.5
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ result: mockResult })
      };

      global.fetch.mockResolvedValue(mockResponse);

      const result = await streamService.getVideoStatus('video-123');

      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.cloudflare.com/client/v4/accounts/${mockAccountId}/stream/video-123`,
        {
          headers: {
            'Authorization': `Bearer ${mockApiToken}`
          }
        }
      );

      expect(result).toEqual(mockResult);
    });

    it('should handle video not found error', async () => {
      const errorResponse = {
        ok: false,
        statusText: 'Not Found',
        json: vi.fn().mockResolvedValue({
          errors: [{ message: 'Video not found' }]
        })
      };

      global.fetch.mockResolvedValue(errorResponse);

      await expect(streamService.getVideoStatus('non-existent'))
        .rejects.toThrow('Stream API error: Video not found');
    });
  });

  describe('getAudioDownloadUrl', () => {
    it('should return audio download URL when available', async () => {
      const mockResult = {
        default: [
          { type: 'video', url: 'https://example.com/video.mp4' },
          { type: 'audio', url: 'https://example.com/audio.mp3' }
        ]
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ result: mockResult })
      };

      global.fetch.mockResolvedValue(mockResponse);

      const result = await streamService.getAudioDownloadUrl('video-123');

      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.cloudflare.com/client/v4/accounts/${mockAccountId}/stream/video-123/downloads`,
        {
          headers: {
            'Authorization': `Bearer ${mockApiToken}`
          }
        }
      );

      expect(result).toBe('https://example.com/audio.mp3');
    });

    it('should handle mp3 type audio downloads', async () => {
      const mockResult = {
        default: [
          { type: 'video', url: 'https://example.com/video.mp4' },
          { type: 'mp3', url: 'https://example.com/audio.mp3' }
        ]
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ result: mockResult })
      };

      global.fetch.mockResolvedValue(mockResponse);

      const result = await streamService.getAudioDownloadUrl('video-123');
      expect(result).toBe('https://example.com/audio.mp3');
    });

    it('should throw error when audio download not available', async () => {
      const mockResult = {
        default: [
          { type: 'video', url: 'https://example.com/video.mp4' }
        ]
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ result: mockResult })
      };

      global.fetch.mockResolvedValue(mockResponse);

      await expect(streamService.getAudioDownloadUrl('video-123'))
        .rejects.toThrow('Audio download URL not available');
    });

    it('should handle missing default downloads', async () => {
      const mockResult = {};

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ result: mockResult })
      };

      global.fetch.mockResolvedValue(mockResponse);

      await expect(streamService.getAudioDownloadUrl('video-123'))
        .rejects.toThrow('Audio download URL not available');
    });
  });

  describe('deleteVideo', () => {
    it('should delete video successfully', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({})
      };

      global.fetch.mockResolvedValue(mockResponse);

      const result = await streamService.deleteVideo('video-123');

      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.cloudflare.com/client/v4/accounts/${mockAccountId}/stream/video-123`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${mockApiToken}`
          }
        }
      );

      expect(result).toBe(true);
    });

    it('should handle delete errors', async () => {
      const errorResponse = {
        ok: false,
        statusText: 'Forbidden',
        json: vi.fn().mockResolvedValue({
          errors: [{ message: 'Access denied' }]
        })
      };

      global.fetch.mockResolvedValue(errorResponse);

      await expect(streamService.deleteVideo('video-123'))
        .rejects.toThrow('Stream API error: Access denied');
    });
  });

  describe('waitForProcessing', () => {
    it('should return when video is ready', async () => {
      const readyStatus = {
        uid: 'video-123',
        status: { state: 'ready' }
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ result: readyStatus })
      };

      global.fetch.mockResolvedValue(mockResponse);

      const result = await streamService.waitForProcessing('video-123', 10000, 1000);

      expect(result).toEqual(readyStatus);
    });

    it('should throw error when video processing fails', async () => {
      const errorStatus = {
        uid: 'video-123',
        status: {
          state: 'error',
          errorReasonText: 'Unsupported format'
        }
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ result: errorStatus })
      };

      global.fetch.mockResolvedValue(mockResponse);

      await expect(streamService.waitForProcessing('video-123', 10000, 1000))
        .rejects.toThrow('Video processing failed: Unsupported format');
    });

    it('should throw timeout error when processing takes too long', async () => {
      const pendingStatus = {
        uid: 'video-123',
        status: { state: 'pending' }
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ result: pendingStatus })
      };

      global.fetch.mockResolvedValue(mockResponse);

      // Use very short timeout for test
      await expect(streamService.waitForProcessing('video-123', 100, 50))
        .rejects.toThrow('Video processing timeout');
    });

    it('should handle error status without error reason', async () => {
      const errorStatus = {
        uid: 'video-123',
        status: { state: 'error' }
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ result: errorStatus })
      };

      global.fetch.mockResolvedValue(mockResponse);

      await expect(streamService.waitForProcessing('video-123', 10000, 1000))
        .rejects.toThrow('Video processing failed: Unknown error');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete video processing workflow', async () => {
      // Upload video
      const uploadResult = { uid: 'video-123', status: { state: 'pending' } };
      const uploadResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ result: uploadResult })
      };

      // Check status - first pending, then ready
      const pendingStatus = { uid: 'video-123', status: { state: 'pending' } };
      const readyStatus = { uid: 'video-123', status: { state: 'ready' } };
      const statusResponse1 = {
        ok: true,
        json: vi.fn().mockResolvedValue({ result: pendingStatus })
      };
      const statusResponse2 = {
        ok: true,
        json: vi.fn().mockResolvedValue({ result: readyStatus })
      };

      // Get audio URL
      const audioResult = {
        default: [{ type: 'audio', url: 'https://example.com/audio.mp3' }]
      };
      const audioResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ result: audioResult })
      };

      // Delete video
      const deleteResponse = { ok: true, json: vi.fn().mockResolvedValue({}) };

      global.fetch
        .mockResolvedValueOnce(uploadResponse)  // Upload
        .mockResolvedValueOnce(statusResponse1) // First status check
        .mockResolvedValueOnce(statusResponse2) // Second status check
        .mockResolvedValueOnce(audioResponse)   // Get audio URL
        .mockResolvedValueOnce(deleteResponse); // Delete

      // Execute workflow
      const uploadedVideo = await streamService.uploadVideoFromUrl('https://example.com/video.mp4');
      expect(uploadedVideo.uid).toBe('video-123');

      const readyVideo = await streamService.waitForProcessing('video-123', 10000, 100);
      expect(readyVideo.status.state).toBe('ready');

      const audioUrl = await streamService.getAudioDownloadUrl('video-123');
      expect(audioUrl).toBe('https://example.com/audio.mp3');

      const deleted = await streamService.deleteVideo('video-123');
      expect(deleted).toBe(true);
    });
  });
});