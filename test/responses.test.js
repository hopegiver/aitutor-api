/**
 * Response Utils Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createErrorResponse,
  parseSSEStream,
  createSSEResponse
} from '../src/utils/responses.js';

describe('Response Utils', () => {
  describe('createErrorResponse', () => {
    it('should create error response with default values', () => {
      const message = 'Something went wrong';
      const result = createErrorResponse(message);

      expect(result).toEqual({
        error: message,
        code: 'ERROR',
        timestamp: expect.any(String)
      });

      // Verify timestamp is valid ISO string
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('should create error response with custom status and code', () => {
      const message = 'Unauthorized access';
      const status = 401;
      const code = 'AUTH_FAILED';

      const result = createErrorResponse(message, status, code);

      expect(result).toEqual({
        error: message,
        code,
        timestamp: expect.any(String)
      });
    });

    it('should generate different timestamps for consecutive calls', async () => {
      const result1 = createErrorResponse('Error 1');
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1));
      const result2 = createErrorResponse('Error 2');

      expect(result1.timestamp).not.toBe(result2.timestamp);
    });

    it('should handle empty message', () => {
      const result = createErrorResponse('');

      expect(result.error).toBe('');
      expect(result.code).toBe('ERROR');
      expect(result.timestamp).toBeTruthy();
    });
  });

  describe('parseSSEStream', () => {
    // Mock ReadableStream and its reader
    const createMockStream = (chunks) => {
      let currentIndex = 0;
      return {
        getReader: () => ({
          read: vi.fn().mockImplementation(() => {
            if (currentIndex >= chunks.length) {
              return Promise.resolve({ done: true, value: undefined });
            }
            const value = new TextEncoder().encode(chunks[currentIndex]);
            currentIndex++;
            return Promise.resolve({ done: false, value });
          })
        })
      };
    };

    it('should parse valid SSE stream with content', async () => {
      const sseData = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n',
        'data: [DONE]\n'
      ];

      const mockStream = createMockStream(sseData);
      const parsedStream = parseSSEStream(mockStream);
      const reader = parsedStream.getReader();

      const chunks = [];
      let result;
      while (!(result = await reader.read()).done) {
        chunks.push(new TextDecoder().decode(result.value));
      }

      expect(chunks).toEqual(['Hello', ' world']);
    });

    it('should handle SSE stream without content in delta', async () => {
      const sseData = [
        'data: {"choices":[{"delta":{"role":"assistant"}}]}\n',
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
        'data: [DONE]\n'
      ];

      const mockStream = createMockStream(sseData);
      const parsedStream = parseSSEStream(mockStream);
      const reader = parsedStream.getReader();

      const chunks = [];
      let result;
      while (!(result = await reader.read()).done) {
        chunks.push(new TextDecoder().decode(result.value));
      }

      expect(chunks).toEqual(['Hello']);
    });

    it('should handle invalid JSON in SSE stream', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const sseData = [
        'data: invalid json\n',
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
        'data: [DONE]\n'
      ];

      const mockStream = createMockStream(sseData);
      const parsedStream = parseSSEStream(mockStream);
      const reader = parsedStream.getReader();

      const chunks = [];
      let result;
      while (!(result = await reader.read()).done) {
        chunks.push(new TextDecoder().decode(result.value));
      }

      expect(chunks).toEqual(['Hello']);
      expect(consoleSpy).toHaveBeenCalledWith('Failed to parse SSE data:', 'invalid json');

      consoleSpy.mockRestore();
    });

    it('should handle empty SSE stream', async () => {
      const sseData = ['data: [DONE]\n'];

      const mockStream = createMockStream(sseData);
      const parsedStream = parseSSEStream(mockStream);
      const reader = parsedStream.getReader();

      const chunks = [];
      let result;
      while (!(result = await reader.read()).done) {
        chunks.push(new TextDecoder().decode(result.value));
      }

      expect(chunks).toEqual([]);
    });

    it('should handle multiple lines in single chunk', async () => {
      const sseData = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\ndata: {"choices":[{"delta":{"content":" world"}}]}\n',
        'data: [DONE]\n'
      ];

      const mockStream = createMockStream(sseData);
      const parsedStream = parseSSEStream(mockStream);
      const reader = parsedStream.getReader();

      const chunks = [];
      let result;
      while (!(result = await reader.read()).done) {
        chunks.push(new TextDecoder().decode(result.value));
      }

      expect(chunks).toEqual(['Hello', ' world']);
    });

    it('should handle partial lines across chunks', async () => {
      const sseData = [
        'data: {"choices":[{"delta":{"con',
        'tent":"Hello"}}]}\n',
        'data: [DONE]\n'
      ];

      const mockStream = createMockStream(sseData);
      const parsedStream = parseSSEStream(mockStream);
      const reader = parsedStream.getReader();

      const chunks = [];
      let result;
      while (!(result = await reader.read()).done) {
        chunks.push(new TextDecoder().decode(result.value));
      }

      expect(chunks).toEqual(['Hello']);
    });

    it('should handle non-data lines in SSE stream', async () => {
      const sseData = [
        ': this is a comment\n',
        'event: message\n',
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
        'data: [DONE]\n'
      ];

      const mockStream = createMockStream(sseData);
      const parsedStream = parseSSEStream(mockStream);
      const reader = parsedStream.getReader();

      const chunks = [];
      let result;
      while (!(result = await reader.read()).done) {
        chunks.push(new TextDecoder().decode(result.value));
      }

      expect(chunks).toEqual(['Hello']);
    });
  });

  describe('createSSEResponse', () => {
    it('should create Response with correct SSE headers', () => {
      const mockStream = new ReadableStream();
      const response = createSSEResponse(mockStream);

      expect(response).toBeInstanceOf(Response);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
      expect(response.headers.get('Cache-Control')).toBe('no-cache');
      expect(response.headers.get('Connection')).toBe('keep-alive');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
    });

    it('should use provided stream as response body', () => {
      const mockStream = new ReadableStream();
      const response = createSSEResponse(mockStream);

      expect(response.body).toBe(mockStream);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete SSE processing flow', async () => {
      // Simulate complete OpenAI SSE response
      const sseData = [
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4","choices":[{"delta":{"role":"assistant"},"index":0}]}\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4","choices":[{"delta":{"content":"Hello"},"index":0}]}\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4","choices":[{"delta":{"content":" there"},"index":0}]}\n',
        'data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1677652288,"model":"gpt-4","choices":[{"delta":{"content":"!"},"index":0}]}\n',
        'data: [DONE]\n'
      ];

      const mockStream = {
        getReader: () => {
          let currentIndex = 0;
          return {
            read: vi.fn().mockImplementation(() => {
              if (currentIndex >= sseData.length) {
                return Promise.resolve({ done: true, value: undefined });
              }
              const value = new TextEncoder().encode(sseData[currentIndex]);
              currentIndex++;
              return Promise.resolve({ done: false, value });
            })
          };
        }
      };

      const parsedStream = parseSSEStream(mockStream);
      const response = createSSEResponse(parsedStream);

      expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');

      // Read the parsed content
      const reader = parsedStream.getReader();
      const chunks = [];
      let result;
      while (!(result = await reader.read()).done) {
        chunks.push(new TextDecoder().decode(result.value));
      }

      expect(chunks).toEqual(['Hello', ' there', '!']);
    });

    it('should handle error response creation with SSE', () => {
      const errorResponse = createErrorResponse('API request failed', 500, 'API_ERROR');

      expect(errorResponse).toEqual({
        error: 'API request failed',
        code: 'API_ERROR',
        timestamp: expect.any(String)
      });

      // Verify timestamp format
      expect(() => new Date(errorResponse.timestamp)).not.toThrow();
    });
  });
});