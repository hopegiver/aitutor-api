/**
 * OpenAI Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenAIService } from '../src/services/openai.js';

describe('OpenAIService', () => {
  let openaiService;
  const mockApiKey = 'test-api-key-1234567890';

  beforeEach(() => {
    openaiService = new OpenAIService(mockApiKey, null);
    // Reset all mocks
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with API key and base URL', () => {
      expect(openaiService.apiKey).toBe(mockApiKey);
      expect(openaiService.baseUrl).toBe('https://malgn-openai.openai.azure.com/');
    });
  });

  describe('addTutorGuidance', () => {
    it('should add system message when none exists', () => {
      const messages = [
        { role: 'user', content: 'What is JavaScript?' }
      ];

      const result = openaiService.addTutorGuidance(messages);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('system');
      expect(result[0].content).toContain('You are an AI tutor');
      expect(result[1]).toEqual(messages[0]);
    });

    it('should modify existing system message when one exists', () => {
      const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is JavaScript?' }
      ];

      const result = openaiService.addTutorGuidance(messages);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('system');
      expect(result[0].content).toContain('You are a helpful assistant.');
      expect(result[0].content).toContain('As an AI tutor');
    });

    it('should preserve original messages without modification', () => {
      const originalMessages = [
        { role: 'user', content: 'What is JavaScript?' }
      ];
      const messagesCopy = [...originalMessages];

      openaiService.addTutorGuidance(messagesCopy);

      expect(originalMessages).toEqual([
        { role: 'user', content: 'What is JavaScript?' }
      ]);
    });

    it('should use custom maxTokens parameter', () => {
      const messages = [{ role: 'user', content: 'Test' }];
      const maxTokens = 300;

      const result = openaiService.addTutorGuidance(messages, maxTokens);

      expect(result[0].content).toContain('350 tokens'); // Should be maxTokens - 50
    });
  });

  describe('streamChat', () => {
    let mockFetch;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch;
    });

    it('should make correct API call with default options', async () => {
      const mockResponse = {
        ok: true,
        body: new ReadableStream()
      };
      mockFetch.mockResolvedValue(mockResponse);

      const messages = [{ role: 'user', content: 'Test message' }];

      await openaiService.streamChat(messages);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://malgn-openai.openai.azure.com/openai/deployments/gpt-4o-mini/chat/completions?api-version=2025-01-01-preview',
        {
          method: 'POST',
          headers: {
            'api-key': mockApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: expect.arrayContaining([
              expect.objectContaining({ role: 'system' }),
              { role: 'user', content: 'Test message' }
            ]),
            stream: true,
            temperature: 0.7,
            max_tokens: 500,
          }),
        }
      );
    });

    it('should use custom options when provided', async () => {
      const mockResponse = {
        ok: true,
        body: new ReadableStream()
      };
      mockFetch.mockResolvedValue(mockResponse);

      const messages = [{ role: 'user', content: 'Test message' }];
      const options = {
        model: 'gpt-4',
        temperature: 0.5,
        maxTokens: 300
      };

      await openaiService.streamChat(messages, options);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://malgn-openai.openai.azure.com/openai/deployments/gpt-4/chat/completions?api-version=2025-01-01-preview',
        expect.objectContaining({
          body: JSON.stringify({
            messages: expect.any(Array),
            stream: true,
            temperature: 0.5,
            max_tokens: 300,
          }),
        })
      );
    });

    it('should handle API errors correctly', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: vi.fn().mockResolvedValue('API key invalid'),
        headers: new Map([['content-type', 'application/json']])
      };
      mockFetch.mockResolvedValue(mockResponse);

      const messages = [{ role: 'user', content: 'Test message' }];

      await expect(openaiService.streamChat(messages)).rejects.toThrow(
        'OpenAI API error: 401 - API key invalid'
      );
    });

    it('should return response body when successful', async () => {
      const mockBody = new ReadableStream();
      const mockResponse = {
        ok: true,
        body: mockBody
      };
      mockFetch.mockResolvedValue(mockResponse);

      const messages = [{ role: 'user', content: 'Test message' }];
      const result = await openaiService.streamChat(messages);

      expect(result).toBe(mockBody);
    });
  });

  describe('createQuiz', () => {
    let mockFetch;

    beforeEach(() => {
      mockFetch = vi.fn();
      global.fetch = mockFetch;
      vi.spyOn(openaiService, 'streamChat');
    });

    it('should call streamChat with correct quiz generation prompt', async () => {
      openaiService.streamChat.mockResolvedValue(new ReadableStream());

      const topic = 'JavaScript Basics';
      const questionCount = 3;

      await openaiService.createQuiz(topic, questionCount);

      expect(openaiService.streamChat).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            role: 'system',
            content: expect.stringContaining('You are a quiz generator')
          }),
          {
            role: 'user',
            content: 'Create 3 multiple choice quiz questions about: JavaScript Basics'
          }
        ],
        {}
      );
    });

    it('should use default question count when not provided', async () => {
      openaiService.streamChat.mockResolvedValue(new ReadableStream());

      const topic = 'Python Basics';

      await openaiService.createQuiz(topic);

      expect(openaiService.streamChat).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: 'Create 5 multiple choice quiz questions about: Python Basics'
          })
        ]),
        {}
      );
    });

    it('should pass options to streamChat', async () => {
      openaiService.streamChat.mockResolvedValue(new ReadableStream());

      const topic = 'React Hooks';
      const options = { temperature: 0.3, maxTokens: 600 };

      await openaiService.createQuiz(topic, 4, options);

      expect(openaiService.streamChat).toHaveBeenCalledWith(
        expect.any(Array),
        options
      );
    });

    it('should include question count in system message', async () => {
      openaiService.streamChat.mockResolvedValue(new ReadableStream());

      const topic = 'Node.js';
      const questionCount = 7;

      await openaiService.createQuiz(topic, questionCount);

      const systemMessage = openaiService.streamChat.mock.calls[0][0][0];
      expect(systemMessage.content).toContain('Generate exactly 7 questions');
    });
  });

  describe('integration scenarios', () => {
    it('should handle empty messages array', () => {
      const messages = [];
      const result = openaiService.addTutorGuidance(messages);

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('system');
    });

    it('should preserve message order when adding system message', () => {
      const messages = [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'Response' },
        { role: 'user', content: 'Second message' }
      ];

      const result = openaiService.addTutorGuidance(messages);

      expect(result).toHaveLength(4);
      expect(result[0].role).toBe('system');
      expect(result[1]).toEqual(messages[0]);
      expect(result[2]).toEqual(messages[1]);
      expect(result[3]).toEqual(messages[2]);
    });
  });
});