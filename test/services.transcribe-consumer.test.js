/**
 * Transcribe Consumer Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TranscribeConsumer } from '../src/services/transcribe-consumer.js';
import handleQueue from '../src/services/transcribe-consumer.js';

// Mock all service dependencies
vi.mock('../src/services/kv.js', () => ({
  KVService: vi.fn()
}));

vi.mock('../src/services/queue.js', () => ({
  QueueService: vi.fn()
}));

vi.mock('../src/services/stream.js', () => ({
  StreamService: vi.fn()
}));

vi.mock('../src/services/whisper.js', () => ({
  WhisperService: vi.fn()
}));

import { KVService } from '../src/services/kv.js';
import { QueueService } from '../src/services/queue.js';
import { StreamService } from '../src/services/stream.js';
import { WhisperService } from '../src/services/whisper.js';

describe('TranscribeConsumer', () => {
  let transcribeConsumer;
  let mockEnv;
  let mockKVService;
  let mockQueueService;
  let mockStreamService;
  let mockWhisperService;

  beforeEach(() => {
    // Mock environment
    mockEnv = {
      TRANSCRIBE_KV: 'mock-kv',
      TRANSCRIBE_QUEUE: 'mock-queue',
      CLOUDFLARE_ACCOUNT_ID: 'test-account',
      STREAM_API_TOKEN: 'test-stream-token',
      OPENAI_API_KEY: 'test-openai-key',
      OPENAI_ENDPOINT: 'https://test.openai.azure.com',
      OPENAI_API_VERSION: '2025-01-01-preview'
    };

    // Mock service instances
    mockKVService = {
      getJob: vi.fn(),
      updateJobStatus: vi.fn(),
      updateJobProgress: vi.fn(),
      setJobResult: vi.fn(),
      setJobError: vi.fn()
    };

    mockQueueService = {
      sendJob: vi.fn()
    };

    mockStreamService = {
      uploadVideoFromUrl: vi.fn(),
      waitForProcessing: vi.fn(),
      getAudioDownloadUrl: vi.fn(),
      deleteVideo: vi.fn()
    };

    mockWhisperService = {
      transcribeFromUrl: vi.fn()
    };

    // Configure mock constructors
    KVService.mockReturnValue(mockKVService);
    QueueService.mockReturnValue(mockQueueService);
    StreamService.mockReturnValue(mockStreamService);
    WhisperService.mockReturnValue(mockWhisperService);

    transcribeConsumer = new TranscribeConsumer(mockEnv);

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize all services with correct parameters', () => {
      expect(KVService).toHaveBeenCalledWith(mockEnv.TRANSCRIBE_KV);
      expect(QueueService).toHaveBeenCalledWith(mockEnv.TRANSCRIBE_QUEUE);
      expect(StreamService).toHaveBeenCalledWith(mockEnv.CLOUDFLARE_ACCOUNT_ID, mockEnv.STREAM_API_TOKEN);
      expect(WhisperService).toHaveBeenCalledWith(
        mockEnv.OPENAI_API_KEY,
        mockEnv.OPENAI_ENDPOINT,
        mockEnv.OPENAI_API_VERSION
      );
    });

    it('should use default OpenAI endpoint and version when not provided', () => {
      const envWithoutOpenAI = {
        TRANSCRIBE_KV: 'mock-kv',
        TRANSCRIBE_QUEUE: 'mock-queue',
        CLOUDFLARE_ACCOUNT_ID: 'test-account',
        STREAM_API_TOKEN: 'test-stream-token',
        OPENAI_API_KEY: 'test-openai-key'
      };

      vi.clearAllMocks();
      new TranscribeConsumer(envWithoutOpenAI);

      expect(WhisperService).toHaveBeenCalledWith(
        'test-openai-key',
        'https://malgn-openai.openai.azure.com',
        '2025-01-01-preview'
      );
    });
  });

  describe('handleMessage', () => {
    it('should process process_video action', async () => {
      const message = { jobId: 'job-123', action: 'process_video' };

      vi.spyOn(transcribeConsumer, 'processVideo').mockResolvedValue();

      await transcribeConsumer.handleMessage(message);

      expect(transcribeConsumer.processVideo).toHaveBeenCalledWith('job-123');
      expect(console.log).toHaveBeenCalledWith('Processing job job-123 with action process_video');
    });

    it('should process transcribe_audio action', async () => {
      const message = {
        jobId: 'job-456',
        action: 'transcribe_audio',
        audioUrl: 'https://example.com/audio.mp3'
      };

      vi.spyOn(transcribeConsumer, 'transcribeAudio').mockResolvedValue();

      await transcribeConsumer.handleMessage(message);

      expect(transcribeConsumer.transcribeAudio).toHaveBeenCalledWith('job-456', 'https://example.com/audio.mp3');
    });

    it('should handle unknown action', async () => {
      const message = { jobId: 'job-789', action: 'unknown_action' };

      await transcribeConsumer.handleMessage(message);

      expect(mockKVService.setJobError).toHaveBeenCalledWith('job-789', expect.any(Error));
      expect(console.error).toHaveBeenCalledWith(
        'Error processing job job-789:',
        expect.objectContaining({ message: 'Unknown action: unknown_action' })
      );
    });

    it('should handle processing errors', async () => {
      const message = { jobId: 'job-error', action: 'process_video' };
      const error = new Error('Processing failed');

      vi.spyOn(transcribeConsumer, 'processVideo').mockRejectedValue(error);

      await transcribeConsumer.handleMessage(message);

      expect(mockKVService.setJobError).toHaveBeenCalledWith('job-error', error);
      expect(console.error).toHaveBeenCalledWith('Error processing job job-error:', error);
    });
  });

  describe('processVideo', () => {
    const mockJobData = {
      id: 'job-123',
      videoUrl: 'https://example.com/video.mp4',
      language: 'en-US',
      options: { format: 'srt' }
    };

    it('should process video successfully', async () => {
      const mockStreamResult = { uid: 'stream-video-123' };
      const mockProcessedVideo = { uid: 'stream-video-123', status: { state: 'ready' } };
      const mockAudioUrl = 'https://example.com/audio.mp3';

      mockKVService.getJob.mockResolvedValue(mockJobData);
      mockKVService.updateJobStatus.mockResolvedValue();
      mockKVService.updateJobProgress.mockResolvedValue();
      mockStreamService.uploadVideoFromUrl.mockResolvedValue(mockStreamResult);
      mockStreamService.waitForProcessing.mockResolvedValue(mockProcessedVideo);
      mockStreamService.getAudioDownloadUrl.mockResolvedValue(mockAudioUrl);

      vi.spyOn(transcribeConsumer, 'transcribeAudio').mockResolvedValue();

      await transcribeConsumer.processVideo('job-123');

      expect(mockKVService.getJob).toHaveBeenCalledWith('job-123');
      expect(mockKVService.updateJobStatus).toHaveBeenCalledWith('job-123', 'processing');
      expect(mockStreamService.uploadVideoFromUrl).toHaveBeenCalledWith(
        'https://example.com/video.mp4',
        { name: 'Transcription Job job-123', jobId: 'job-123' }
      );
      expect(mockStreamService.waitForProcessing).toHaveBeenCalledWith('stream-video-123');
      expect(mockStreamService.getAudioDownloadUrl).toHaveBeenCalledWith('stream-video-123');
      expect(transcribeConsumer.transcribeAudio).toHaveBeenCalledWith('job-123', mockAudioUrl, 'stream-video-123');
    });

    it('should throw error when job not found', async () => {
      mockKVService.getJob.mockResolvedValue(null);

      await expect(transcribeConsumer.processVideo('non-existent'))
        .rejects.toThrow('Job non-existent not found');
    });

    it('should handle stream upload errors', async () => {
      const error = new Error('Upload failed');

      mockKVService.getJob.mockResolvedValue(mockJobData);
      mockKVService.updateJobStatus.mockResolvedValue();
      mockKVService.updateJobProgress.mockResolvedValue();
      mockStreamService.uploadVideoFromUrl.mockRejectedValue(error);

      await expect(transcribeConsumer.processVideo('job-123')).rejects.toThrow('Upload failed');
    });
  });

  describe('transcribeAudio', () => {
    const mockJobData = {
      id: 'job-456',
      language: 'ko-KR',
      options: {
        format: 'vtt',
        timestamps: true,
        wordTimestamps: true
      }
    };

    it('should transcribe audio successfully', async () => {
      const audioUrl = 'https://example.com/audio.mp3';
      const mockTranscriptionResult = {
        text: 'Hello world',
        duration: 5.2,
        segments: [{ start: 0, end: 5.2, text: 'Hello world' }],
        language: 'ko'
      };

      mockKVService.getJob.mockResolvedValue(mockJobData);
      mockKVService.updateJobProgress.mockResolvedValue();
      mockWhisperService.transcribeFromUrl.mockResolvedValue(mockTranscriptionResult);
      mockKVService.setJobResult.mockResolvedValue();

      await transcribeConsumer.transcribeAudio('job-456', audioUrl);

      expect(mockWhisperService.transcribeFromUrl).toHaveBeenCalledWith(audioUrl, {
        language: 'ko',
        format: 'vtt',
        timestamps: true,
        wordTimestamps: true
      });

      expect(mockKVService.setJobResult).toHaveBeenCalledWith(
        'job-456',
        mockTranscriptionResult,
        {
          duration: 5.2,
          wordCount: 2,
          segmentCount: 1,
          audioUrl
        }
      );
    });

    it('should transcribe audio with stream video cleanup', async () => {
      const audioUrl = 'https://example.com/audio.mp3';
      const streamVideoId = 'stream-video-123';
      const mockTranscriptionResult = {
        text: 'Hello world',
        duration: 5.2,
        segments: []
      };

      mockKVService.getJob.mockResolvedValue(mockJobData);
      mockKVService.updateJobProgress.mockResolvedValue();
      mockWhisperService.transcribeFromUrl.mockResolvedValue(mockTranscriptionResult);
      mockKVService.setJobResult.mockResolvedValue();
      mockStreamService.deleteVideo.mockResolvedValue();

      await transcribeConsumer.transcribeAudio('job-456', audioUrl, streamVideoId);

      expect(mockKVService.setJobResult).toHaveBeenCalledWith(
        'job-456',
        mockTranscriptionResult,
        expect.objectContaining({
          streamVideoId,
          audioUrl
        })
      );

      expect(mockStreamService.deleteVideo).toHaveBeenCalledWith(streamVideoId);
    });

    it('should handle video deletion errors gracefully', async () => {
      const audioUrl = 'https://example.com/audio.mp3';
      const streamVideoId = 'stream-video-123';
      const mockTranscriptionResult = { text: 'Hello world', duration: 5.2, segments: [] };

      mockKVService.getJob.mockResolvedValue(mockJobData);
      mockKVService.updateJobProgress.mockResolvedValue();
      mockWhisperService.transcribeFromUrl.mockResolvedValue(mockTranscriptionResult);
      mockKVService.setJobResult.mockResolvedValue();
      mockStreamService.deleteVideo.mockRejectedValue(new Error('Delete failed'));

      // Should not throw despite deletion error
      await transcribeConsumer.transcribeAudio('job-456', audioUrl, streamVideoId);

      expect(console.warn).toHaveBeenCalledWith(
        'Failed to delete video stream-video-123:',
        expect.any(Error)
      );
    });

    it('should throw error when job not found', async () => {
      mockKVService.getJob.mockResolvedValue(null);

      await expect(transcribeConsumer.transcribeAudio('non-existent', 'audio-url'))
        .rejects.toThrow('Job non-existent not found');
    });
  });

  describe('mapLanguageCode', () => {
    it('should map known language codes', () => {
      expect(transcribeConsumer.mapLanguageCode('ko-KR')).toBe('ko');
      expect(transcribeConsumer.mapLanguageCode('en-US')).toBe('en');
      expect(transcribeConsumer.mapLanguageCode('ja-JP')).toBe('ja');
      expect(transcribeConsumer.mapLanguageCode('zh-CN')).toBe('zh');
    });

    it('should extract language from unknown locale codes', () => {
      expect(transcribeConsumer.mapLanguageCode('pt-BR')).toBe('pt');
      expect(transcribeConsumer.mapLanguageCode('es-MX')).toBe('es');
    });

    it('should return language as-is for simple codes', () => {
      expect(transcribeConsumer.mapLanguageCode('ko')).toBe('ko');
      expect(transcribeConsumer.mapLanguageCode('en')).toBe('en');
    });

    it('should return auto for empty or invalid language', () => {
      expect(transcribeConsumer.mapLanguageCode('')).toBe('auto');
      expect(transcribeConsumer.mapLanguageCode(null)).toBe('auto');
      expect(transcribeConsumer.mapLanguageCode(undefined)).toBe('auto');
    });
  });
});

describe('handleQueue function', () => {
  let mockEnv;
  let mockConsumer;
  let mockBatch;

  beforeEach(() => {
    mockEnv = {
      TRANSCRIBE_KV: 'mock-kv',
      TRANSCRIBE_QUEUE: 'mock-queue',
      CLOUDFLARE_ACCOUNT_ID: 'test-account',
      STREAM_API_TOKEN: 'test-stream-token',
      OPENAI_API_KEY: 'test-openai-key'
    };

    mockConsumer = {
      handleMessage: vi.fn()
    };

    mockBatch = {
      messages: [
        {
          body: { jobId: 'job-1', action: 'process_video' },
          ack: vi.fn(),
          retry: vi.fn()
        },
        {
          body: { jobId: 'job-2', action: 'transcribe_audio', audioUrl: 'audio.mp3' },
          ack: vi.fn(),
          retry: vi.fn()
        }
      ]
    };

    // Mock TranscribeConsumer constructor
    vi.spyOn(TranscribeConsumer.prototype, 'constructor').mockImplementation(() => mockConsumer);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should process all messages successfully', async () => {
    mockConsumer.handleMessage.mockResolvedValue();

    await handleQueue(mockBatch, mockEnv);

    expect(mockConsumer.handleMessage).toHaveBeenCalledTimes(2);
    expect(mockConsumer.handleMessage).toHaveBeenCalledWith({ jobId: 'job-1', action: 'process_video' });
    expect(mockConsumer.handleMessage).toHaveBeenCalledWith({
      jobId: 'job-2',
      action: 'transcribe_audio',
      audioUrl: 'audio.mp3'
    });

    expect(mockBatch.messages[0].ack).toHaveBeenCalled();
    expect(mockBatch.messages[1].ack).toHaveBeenCalled();
  });

  it('should retry failed messages', async () => {
    const error = new Error('Processing failed');
    mockConsumer.handleMessage
      .mockResolvedValueOnce() // First message succeeds
      .mockRejectedValueOnce(error); // Second message fails

    await handleQueue(mockBatch, mockEnv);

    expect(mockBatch.messages[0].ack).toHaveBeenCalled();
    expect(mockBatch.messages[0].retry).not.toHaveBeenCalled();

    expect(mockBatch.messages[1].ack).not.toHaveBeenCalled();
    expect(mockBatch.messages[1].retry).toHaveBeenCalled();

    expect(console.error).toHaveBeenCalledWith('Failed to process queue message:', error);
  });

  it('should handle empty batch', async () => {
    const emptyBatch = { messages: [] };

    await handleQueue(emptyBatch, mockEnv);

    expect(mockConsumer.handleMessage).not.toHaveBeenCalled();
  });
});