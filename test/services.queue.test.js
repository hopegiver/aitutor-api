/**
 * Queue Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QueueService } from '../src/services/queue.js';

describe('QueueService', () => {
  let queueService;
  let mockQueue;

  beforeEach(() => {
    // Mock Queue
    mockQueue = {
      send: vi.fn()
    };

    queueService = new QueueService(mockQueue);
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with queue instance', () => {
      expect(queueService.queue).toBe(mockQueue);
    });
  });

  describe('sendJob', () => {
    it('should send job message with basic structure', async () => {
      mockQueue.send.mockResolvedValue();

      const result = await queueService.sendJob('job-123', 'test_action');

      expect(mockQueue.send).toHaveBeenCalledWith({
        jobId: 'job-123',
        action: 'test_action',
        timestamp: expect.any(String)
      });

      expect(result).toEqual({
        jobId: 'job-123',
        action: 'test_action',
        timestamp: expect.any(String)
      });

      // Verify timestamp is valid ISO string
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('should include additional data in message', async () => {
      mockQueue.send.mockResolvedValue();

      const additionalData = {
        priority: 'high',
        retryCount: 3,
        metadata: { userId: 'user-123' }
      };

      const result = await queueService.sendJob('job-456', 'process_data', additionalData);

      expect(mockQueue.send).toHaveBeenCalledWith({
        jobId: 'job-456',
        action: 'process_data',
        timestamp: expect.any(String),
        priority: 'high',
        retryCount: 3,
        metadata: { userId: 'user-123' }
      });

      expect(result.priority).toBe('high');
      expect(result.retryCount).toBe(3);
      expect(result.metadata.userId).toBe('user-123');
    });

    it('should handle queue send errors', async () => {
      const error = new Error('Queue send failed');
      mockQueue.send.mockRejectedValue(error);

      await expect(queueService.sendJob('job-123', 'test_action'))
        .rejects.toThrow('Queue send failed');
    });

    it('should generate unique timestamps for consecutive calls', async () => {
      mockQueue.send.mockResolvedValue();

      const result1 = await queueService.sendJob('job-1', 'action1');
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1));
      const result2 = await queueService.sendJob('job-2', 'action2');

      expect(result1.timestamp).not.toBe(result2.timestamp);
    });
  });

  describe('sendProcessVideo', () => {
    it('should send process video job with correct action', async () => {
      mockQueue.send.mockResolvedValue();

      const result = await queueService.sendProcessVideo('video-job-123');

      expect(mockQueue.send).toHaveBeenCalledWith({
        jobId: 'video-job-123',
        action: 'process_video',
        timestamp: expect.any(String)
      });

      expect(result.action).toBe('process_video');
      expect(result.jobId).toBe('video-job-123');
    });

    it('should return message object with timestamp', async () => {
      mockQueue.send.mockResolvedValue();

      const result = await queueService.sendProcessVideo('video-job-456');

      expect(result).toEqual({
        jobId: 'video-job-456',
        action: 'process_video',
        timestamp: expect.any(String)
      });
    });
  });

  describe('sendTranscribeAudio', () => {
    it('should send transcribe audio job with audio URL', async () => {
      mockQueue.send.mockResolvedValue();

      const audioUrl = 'https://example.com/audio.mp3';
      const result = await queueService.sendTranscribeAudio('audio-job-123', audioUrl);

      expect(mockQueue.send).toHaveBeenCalledWith({
        jobId: 'audio-job-123',
        action: 'transcribe_audio',
        audioUrl: 'https://example.com/audio.mp3',
        timestamp: expect.any(String)
      });

      expect(result.action).toBe('transcribe_audio');
      expect(result.audioUrl).toBe(audioUrl);
    });

    it('should handle various audio URL formats', async () => {
      mockQueue.send.mockResolvedValue();

      const testUrls = [
        'https://cdn.example.com/audio/file.wav',
        'http://localhost:3000/uploads/audio.m4a',
        'https://storage.googleapis.com/bucket/audio.flac'
      ];

      for (const url of testUrls) {
        await queueService.sendTranscribeAudio('job-' + Date.now(), url);

        expect(mockQueue.send).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'transcribe_audio',
            audioUrl: url
          })
        );
      }
    });
  });

  describe('error handling', () => {
    it('should propagate queue errors in sendProcessVideo', async () => {
      const error = new Error('Queue unavailable');
      mockQueue.send.mockRejectedValue(error);

      await expect(queueService.sendProcessVideo('job-123'))
        .rejects.toThrow('Queue unavailable');
    });

    it('should propagate queue errors in sendTranscribeAudio', async () => {
      const error = new Error('Message too large');
      mockQueue.send.mockRejectedValue(error);

      await expect(queueService.sendTranscribeAudio('job-123', 'http://example.com/audio.mp3'))
        .rejects.toThrow('Message too large');
    });
  });

  describe('integration scenarios', () => {
    it('should handle multiple job types in sequence', async () => {
      mockQueue.send.mockResolvedValue();

      // Send different types of jobs
      const videoJob = await queueService.sendProcessVideo('video-123');
      const audioJob = await queueService.sendTranscribeAudio('audio-456', 'http://example.com/audio.mp3');
      const customJob = await queueService.sendJob('custom-789', 'custom_action', {
        priority: 'low',
        source: 'api'
      });

      // Verify all jobs were sent
      expect(mockQueue.send).toHaveBeenCalledTimes(3);

      // Verify job types
      expect(videoJob.action).toBe('process_video');
      expect(audioJob.action).toBe('transcribe_audio');
      expect(customJob.action).toBe('custom_action');

      // Verify additional data is preserved
      expect(audioJob.audioUrl).toBe('http://example.com/audio.mp3');
      expect(customJob.priority).toBe('low');
      expect(customJob.source).toBe('api');
    });

    it('should maintain message structure consistency', async () => {
      mockQueue.send.mockResolvedValue();

      const jobs = [
        await queueService.sendProcessVideo('job-1'),
        await queueService.sendTranscribeAudio('job-2', 'http://example.com/audio.mp3'),
        await queueService.sendJob('job-3', 'custom', { extra: 'data' })
      ];

      // All jobs should have basic structure
      jobs.forEach(job => {
        expect(job).toHaveProperty('jobId');
        expect(job).toHaveProperty('action');
        expect(job).toHaveProperty('timestamp');
        expect(typeof job.jobId).toBe('string');
        expect(typeof job.action).toBe('string');
        expect(typeof job.timestamp).toBe('string');
      });
    });
  });
});