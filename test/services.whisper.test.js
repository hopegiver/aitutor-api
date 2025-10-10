/**
 * Whisper Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WhisperService } from '../src/services/whisper.js';

describe('WhisperService', () => {
  let whisperService;
  const mockApiKey = 'test-api-key';
  const mockEndpoint = 'https://test.openai.azure.com';
  const mockApiVersion = '2025-01-01-preview';

  beforeEach(() => {
    whisperService = new WhisperService(mockApiKey, mockEndpoint, mockApiVersion);

    // Mock global functions
    global.fetch = vi.fn();
    global.FormData = vi.fn(() => ({
      append: vi.fn()
    }));
    global.Blob = vi.fn();

    // Mock console.error
    vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with API key and endpoint', () => {
      expect(whisperService.apiKey).toBe(mockApiKey);
      expect(whisperService.endpoint).toBe(mockEndpoint);
      expect(whisperService.apiVersion).toBe(mockApiVersion);
      expect(whisperService.baseUrl).toBe(`${mockEndpoint}/openai/deployments/whisper-1/audio/transcriptions`);
    });

    it('should use default API version when not provided', () => {
      const service = new WhisperService(mockApiKey, mockEndpoint);
      expect(service.apiVersion).toBe('2025-01-01-preview');
    });
  });

  describe('transcribeFromUrl', () => {
    it('should fetch audio and transcribe successfully', async () => {
      const audioUrl = 'https://example.com/audio.mp3';
      const mockAudioBuffer = new ArrayBuffer(1024);
      const mockBlob = { type: 'audio/mp3' };
      const mockTranscriptionResult = { text: 'Hello world', language: 'en' };

      // Mock audio fetch
      const mockAudioResponse = {
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(mockAudioBuffer)
      };

      global.fetch.mockResolvedValueOnce(mockAudioResponse);
      global.Blob.mockReturnValue(mockBlob);

      // Mock transcribeFromBlob
      vi.spyOn(whisperService, 'transcribeFromBlob').mockResolvedValue(mockTranscriptionResult);

      const result = await whisperService.transcribeFromUrl(audioUrl, { language: 'en' });

      expect(global.fetch).toHaveBeenCalledWith(audioUrl);
      expect(global.Blob).toHaveBeenCalledWith([mockAudioBuffer], { type: 'audio/mp3' });
      expect(whisperService.transcribeFromBlob).toHaveBeenCalledWith(mockBlob, { language: 'en' });
      expect(result).toEqual(mockTranscriptionResult);
    });

    it('should handle audio fetch errors', async () => {
      const audioUrl = 'https://example.com/not-found.mp3';
      const mockAudioResponse = {
        ok: false,
        statusText: 'Not Found'
      };

      global.fetch.mockResolvedValue(mockAudioResponse);

      await expect(whisperService.transcribeFromUrl(audioUrl))
        .rejects.toThrow('Failed to fetch audio: Not Found');
    });

    it('should handle network errors', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      await expect(whisperService.transcribeFromUrl('https://example.com/audio.mp3'))
        .rejects.toThrow('Network error');
    });
  });

  describe('transcribeFromBlob', () => {
    let mockFormData;

    beforeEach(() => {
      mockFormData = {
        append: vi.fn()
      };
      global.FormData.mockReturnValue(mockFormData);
    });

    it('should transcribe audio blob with default options', async () => {
      const mockBlob = new Blob(['audio data']);
      const mockApiResponse = {
        text: 'Hello world',
        language: 'en',
        duration: 5.2,
        segments: [
          { start: 0, end: 5.2, text: 'Hello world' }
        ]
      };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockApiResponse)
      };

      global.fetch.mockResolvedValue(mockResponse);
      vi.spyOn(whisperService, 'formatTranscriptionResult').mockReturnValue({
        text: 'Hello world',
        language: 'en',
        duration: 5.2,
        segments: mockApiResponse.segments,
        words: []
      });

      const result = await whisperService.transcribeFromBlob(mockBlob);

      expect(mockFormData.append).toHaveBeenCalledWith('file', mockBlob, 'audio.mp3');
      expect(mockFormData.append).toHaveBeenCalledWith('model', 'whisper-1');
      expect(mockFormData.append).toHaveBeenCalledWith('response_format', 'verbose_json');
      expect(mockFormData.append).toHaveBeenCalledWith('timestamp_granularities[]', 'segment');

      expect(global.fetch).toHaveBeenCalledWith(
        `${mockEndpoint}/openai/deployments/whisper-1/audio/transcriptions?api-version=${mockApiVersion}`,
        {
          method: 'POST',
          headers: {
            'api-key': mockApiKey
          },
          body: mockFormData
        }
      );

      expect(result.text).toBe('Hello world');
    });

    it('should include language when specified', async () => {
      const mockBlob = new Blob(['audio data']);
      const options = { language: 'es' };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ text: 'Hola mundo', language: 'es' })
      };

      global.fetch.mockResolvedValue(mockResponse);
      vi.spyOn(whisperService, 'formatTranscriptionResult').mockReturnValue({});

      await whisperService.transcribeFromBlob(mockBlob, options);

      expect(mockFormData.append).toHaveBeenCalledWith('language', 'es');
    });

    it('should include custom response format', async () => {
      const mockBlob = new Blob(['audio data']);
      const options = { format: 'srt' };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ text: 'Hello world' })
      };

      global.fetch.mockResolvedValue(mockResponse);
      vi.spyOn(whisperService, 'formatTranscriptionResult').mockReturnValue({});

      await whisperService.transcribeFromBlob(mockBlob, options);

      expect(mockFormData.append).toHaveBeenCalledWith('response_format', 'srt');
    });

    it('should include word timestamps when requested', async () => {
      const mockBlob = new Blob(['audio data']);
      const options = { wordTimestamps: true };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ text: 'Hello world' })
      };

      global.fetch.mockResolvedValue(mockResponse);
      vi.spyOn(whisperService, 'formatTranscriptionResult').mockReturnValue({});

      await whisperService.transcribeFromBlob(mockBlob, options);

      expect(mockFormData.append).toHaveBeenCalledWith('timestamp_granularities[]', 'segment');
      expect(mockFormData.append).toHaveBeenCalledWith('timestamp_granularities[]', 'word');
    });

    it('should skip timestamps when disabled', async () => {
      const mockBlob = new Blob(['audio data']);
      const options = { timestamps: false };

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ text: 'Hello world' })
      };

      global.fetch.mockResolvedValue(mockResponse);
      vi.spyOn(whisperService, 'formatTranscriptionResult').mockReturnValue({});

      await whisperService.transcribeFromBlob(mockBlob, options);

      expect(mockFormData.append).not.toHaveBeenCalledWith('timestamp_granularities[]', 'segment');
    });

    it('should handle API errors', async () => {
      const mockBlob = new Blob(['audio data']);
      const mockResponse = {
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue('Invalid audio format')
      };

      global.fetch.mockResolvedValue(mockResponse);

      await expect(whisperService.transcribeFromBlob(mockBlob))
        .rejects.toThrow('OpenAI API error: 400 Invalid audio format');
    });
  });

  describe('formatTranscriptionResult', () => {
    it('should format basic transcription result', () => {
      const result = {
        text: 'Hello world',
        language: 'en',
        duration: 5.2
      };

      const formatted = whisperService.formatTranscriptionResult(result, {});

      expect(formatted).toEqual({
        text: 'Hello world',
        language: 'en',
        duration: 5.2,
        segments: [],
        words: []
      });
    });

    it('should include segments and words when available', () => {
      const result = {
        text: 'Hello world',
        language: 'en',
        duration: 5.2,
        segments: [{ start: 0, end: 5.2, text: 'Hello world' }],
        words: [
          { start: 0, end: 2.1, text: 'Hello' },
          { start: 2.2, end: 5.2, text: 'world' }
        ]
      };

      const formatted = whisperService.formatTranscriptionResult(result, {});

      expect(formatted.segments).toEqual(result.segments);
      expect(formatted.words).toEqual(result.words);
    });

    it('should generate SRT format when requested', () => {
      const result = {
        text: 'Hello world',
        segments: [{ start: 0, end: 5.2, text: 'Hello world' }]
      };

      vi.spyOn(whisperService, 'convertToSRT').mockReturnValue('1\n00:00:00,000 --> 00:00:05,200\nHello world\n');

      const formatted = whisperService.formatTranscriptionResult(result, { format: 'srt' });

      expect(whisperService.convertToSRT).toHaveBeenCalledWith(result.segments);
      expect(formatted.srt).toBe('1\n00:00:00,000 --> 00:00:05,200\nHello world\n');
    });

    it('should generate VTT format when requested', () => {
      const result = {
        text: 'Hello world',
        segments: [{ start: 0, end: 5.2, text: 'Hello world' }]
      };

      vi.spyOn(whisperService, 'convertToVTT').mockReturnValue('WEBVTT\n\n00:00:00.000 --> 00:00:05.200\nHello world\n');

      const formatted = whisperService.formatTranscriptionResult(result, { format: 'vtt' });

      expect(whisperService.convertToVTT).toHaveBeenCalledWith(result.segments);
      expect(formatted.vtt).toBe('WEBVTT\n\n00:00:00.000 --> 00:00:05.200\nHello world\n');
    });
  });

  describe('convertToSRT', () => {
    it('should convert segments to SRT format', () => {
      const segments = [
        { start: 0, end: 2.5, text: 'Hello there' },
        { start: 3.0, end: 5.8, text: 'How are you?' }
      ];

      vi.spyOn(whisperService, 'formatSRTTime')
        .mockReturnValueOnce('00:00:00,000')
        .mockReturnValueOnce('00:00:02,500')
        .mockReturnValueOnce('00:00:03,000')
        .mockReturnValueOnce('00:00:05,800');

      const result = whisperService.convertToSRT(segments);

      expect(result).toBe('1\n00:00:00,000 --> 00:00:02,500\nHello there\n\n2\n00:00:03,000 --> 00:00:05,800\nHow are you?\n');
    });

    it('should handle empty segments', () => {
      const result = whisperService.convertToSRT([]);
      expect(result).toBe('');
    });
  });

  describe('convertToVTT', () => {
    it('should convert segments to VTT format', () => {
      const segments = [
        { start: 0, end: 2.5, text: 'Hello there' },
        { start: 3.0, end: 5.8, text: 'How are you?' }
      ];

      vi.spyOn(whisperService, 'formatVTTTime')
        .mockReturnValueOnce('00:00:00.000')
        .mockReturnValueOnce('00:00:02.500')
        .mockReturnValueOnce('00:00:03.000')
        .mockReturnValueOnce('00:00:05.800');

      const result = whisperService.convertToVTT(segments);

      expect(result).toBe('WEBVTT\n\n00:00:00.000 --> 00:00:02.500\nHello there\n\n00:00:03.000 --> 00:00:05.800\nHow are you?\n');
    });
  });

  describe('formatSRTTime', () => {
    it('should format time in SRT format', () => {
      expect(whisperService.formatSRTTime(0)).toBe('00:00:00,000');
      expect(whisperService.formatSRTTime(65.5)).toBe('00:01:05,500');
      expect(whisperService.formatSRTTime(3661.123)).toBe('01:01:01,123');
    });

    it('should handle fractional seconds correctly', () => {
      expect(whisperService.formatSRTTime(1.999)).toBe('00:00:01,999');
      expect(whisperService.formatSRTTime(2.001)).toBe('00:00:02,001');
    });
  });

  describe('formatVTTTime', () => {
    it('should format time in VTT format', () => {
      expect(whisperService.formatVTTTime(0)).toBe('00:00:00.000');
      expect(whisperService.formatVTTTime(65.5)).toBe('00:01:05.500');
      expect(whisperService.formatVTTTime(3661.123)).toBe('01:01:01.123');
    });

    it('should handle fractional seconds with proper precision', () => {
      expect(whisperService.formatVTTTime(1.999)).toBe('00:00:01.999');
      expect(whisperService.formatVTTTime(2.001)).toBe('00:00:02.001');
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete transcription workflow from URL to SRT', async () => {
      const audioUrl = 'https://example.com/audio.mp3';
      const mockAudioBuffer = new ArrayBuffer(1024);
      const mockBlob = { type: 'audio/mp3' };

      // Mock audio fetch
      const mockAudioResponse = {
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(mockAudioBuffer)
      };

      // Mock API response
      const mockApiResponse = {
        text: 'Hello world this is a test',
        language: 'en',
        duration: 8.5,
        segments: [
          { start: 0, end: 4.2, text: 'Hello world' },
          { start: 4.5, end: 8.5, text: 'this is a test' }
        ]
      };

      const mockTranscriptionResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockApiResponse)
      };

      global.fetch
        .mockResolvedValueOnce(mockAudioResponse)
        .mockResolvedValueOnce(mockTranscriptionResponse);

      global.Blob.mockReturnValue(mockBlob);

      const result = await whisperService.transcribeFromUrl(audioUrl, {
        language: 'en',
        format: 'srt',
        wordTimestamps: true
      });

      expect(result.text).toBe('Hello world this is a test');
      expect(result.language).toBe('en');
      expect(result.duration).toBe(8.5);
      expect(result.segments).toHaveLength(2);
      expect(result.srt).toBeTruthy();
    });
  });
});