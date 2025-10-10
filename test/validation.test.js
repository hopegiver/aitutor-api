/**
 * Validation Utils Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  validateChatMessages,
  validateTutorRequest,
  validateOptions,
  sanitizeInput
} from '../src/utils/validation.js';

describe('Validation Utils', () => {
  describe('validateChatMessages', () => {
    it('should pass validation for valid messages array', () => {
      const validMessages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello, how are you?' },
        { role: 'assistant', content: 'I am doing well, thank you!' }
      ];

      expect(() => validateChatMessages(validMessages)).not.toThrow();
    });

    it('should throw error for non-array input', () => {
      expect(() => validateChatMessages('not an array')).toThrow('Messages must be an array');
      expect(() => validateChatMessages({})).toThrow('Messages must be an array');
      expect(() => validateChatMessages(null)).toThrow('Messages must be an array');
    });

    it('should throw error for empty array', () => {
      expect(() => validateChatMessages([])).toThrow('Messages array cannot be empty');
    });

    it('should throw error for message without role', () => {
      const invalidMessages = [
        { content: 'Hello' }
      ];

      expect(() => validateChatMessages(invalidMessages))
        .toThrow('Message at index 0 must have role and content');
    });

    it('should throw error for message without content', () => {
      const invalidMessages = [
        { role: 'user' }
      ];

      expect(() => validateChatMessages(invalidMessages))
        .toThrow('Message at index 0 must have role and content');
    });

    it('should throw error for invalid role', () => {
      const invalidMessages = [
        { role: 'invalid', content: 'Hello' }
      ];

      expect(() => validateChatMessages(invalidMessages))
        .toThrow('Invalid role "invalid" at index 0');
    });

    it('should throw error for non-string content', () => {
      const invalidMessages = [
        { role: 'user', content: 123 }
      ];

      expect(() => validateChatMessages(invalidMessages))
        .toThrow('Message content at index 0 must be a string');
    });

    it('should throw error for content exceeding 4000 characters', () => {
      const longContent = 'a'.repeat(4001);
      const invalidMessages = [
        { role: 'user', content: longContent }
      ];

      expect(() => validateChatMessages(invalidMessages))
        .toThrow('Message content at index 0 exceeds 4000 characters');
    });

    it('should validate multiple messages and report correct index for errors', () => {
      const invalidMessages = [
        { role: 'user', content: 'Valid message' },
        { role: 'user', content: 123 }, // Invalid at index 1
        { role: 'assistant', content: 'Another valid message' }
      ];

      expect(() => validateChatMessages(invalidMessages))
        .toThrow('Message content at index 1 must be a string');
    });

    it('should accept all valid roles', () => {
      const messagesWithAllRoles = [
        { role: 'system', content: 'System message' },
        { role: 'user', content: 'User message' },
        { role: 'assistant', content: 'Assistant message' }
      ];

      expect(() => validateChatMessages(messagesWithAllRoles)).not.toThrow();
    });
  });

  describe('validateTutorRequest', () => {
    it('should pass validation for valid question', () => {
      const question = 'What is JavaScript?';

      expect(() => validateTutorRequest(question)).not.toThrow();
    });

    it('should pass validation for valid question and context', () => {
      const question = 'What is JavaScript?';
      const context = 'The user is learning web development.';

      expect(() => validateTutorRequest(question, context)).not.toThrow();
    });

    it('should throw error for non-string question', () => {
      expect(() => validateTutorRequest(123)).toThrow('Question must be a string');
      expect(() => validateTutorRequest(null)).toThrow('Question must be a string');
      expect(() => validateTutorRequest({})).toThrow('Question must be a string');
    });

    it('should throw error for empty question', () => {
      expect(() => validateTutorRequest('')).toThrow('Question cannot be empty');
      expect(() => validateTutorRequest('   ')).toThrow('Question cannot be empty');
    });

    it('should throw error for question exceeding 2000 characters', () => {
      const longQuestion = 'a'.repeat(2001);

      expect(() => validateTutorRequest(longQuestion))
        .toThrow('Question exceeds 2000 characters');
    });

    it('should throw error for non-string context', () => {
      const question = 'What is JavaScript?';

      expect(() => validateTutorRequest(question, 123))
        .toThrow('Context must be a string');
      expect(() => validateTutorRequest(question, {}))
        .toThrow('Context must be a string');
    });

    it('should allow undefined context', () => {
      const question = 'What is JavaScript?';

      expect(() => validateTutorRequest(question, undefined)).not.toThrow();
    });

    it('should throw error for context exceeding 3000 characters', () => {
      const question = 'What is JavaScript?';
      const longContext = 'a'.repeat(3001);

      expect(() => validateTutorRequest(question, longContext))
        .toThrow('Context exceeds 3000 characters');
    });
  });

  describe('validateOptions', () => {
    it('should pass validation for valid options', () => {
      const validOptions = {
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 500
      };

      expect(() => validateOptions(validOptions)).not.toThrow();
    });

    it('should pass validation for empty options object', () => {
      expect(() => validateOptions({})).not.toThrow();
    });

    it('should throw error for non-object options', () => {
      expect(() => validateOptions('not an object')).toThrow('Options must be an object');
      expect(() => validateOptions(null)).toThrow('Options must be an object');
      expect(() => validateOptions([])).toThrow('Options must be an object');
    });

    it('should throw error for non-string model', () => {
      const invalidOptions = { model: 123 };

      expect(() => validateOptions(invalidOptions)).toThrow('Model must be a string');
    });

    it('should allow undefined model', () => {
      const options = { temperature: 0.5 };

      expect(() => validateOptions(options)).not.toThrow();
    });

    it('should throw error for invalid temperature type', () => {
      const invalidOptions = { temperature: 'hot' };

      expect(() => validateOptions(invalidOptions))
        .toThrow('Temperature must be a number between 0 and 2');
    });

    it('should throw error for temperature out of range', () => {
      expect(() => validateOptions({ temperature: -1 }))
        .toThrow('Temperature must be a number between 0 and 2');
      expect(() => validateOptions({ temperature: 3 }))
        .toThrow('Temperature must be a number between 0 and 2');
    });

    it('should allow valid temperature values', () => {
      expect(() => validateOptions({ temperature: 0 })).not.toThrow();
      expect(() => validateOptions({ temperature: 1 })).not.toThrow();
      expect(() => validateOptions({ temperature: 2 })).not.toThrow();
      expect(() => validateOptions({ temperature: 0.5 })).not.toThrow();
    });

    it('should throw error for invalid maxTokens type', () => {
      const invalidOptions = { maxTokens: 'many' };

      expect(() => validateOptions(invalidOptions))
        .toThrow('Max tokens must be a number between 1 and 4000');
    });

    it('should throw error for maxTokens out of range', () => {
      expect(() => validateOptions({ maxTokens: 0 }))
        .toThrow('Max tokens must be a number between 1 and 4000');
      expect(() => validateOptions({ maxTokens: 4001 }))
        .toThrow('Max tokens must be a number between 1 and 4000');
    });

    it('should allow valid maxTokens values', () => {
      expect(() => validateOptions({ maxTokens: 1 })).not.toThrow();
      expect(() => validateOptions({ maxTokens: 500 })).not.toThrow();
      expect(() => validateOptions({ maxTokens: 4000 })).not.toThrow();
    });

    it('should allow undefined optional fields', () => {
      const options = {
        model: 'gpt-4'
        // temperature and maxTokens are undefined
      };

      expect(() => validateOptions(options)).not.toThrow();
    });
  });

  describe('sanitizeInput', () => {
    it('should return non-string input unchanged', () => {
      expect(sanitizeInput(123)).toBe(123);
      expect(sanitizeInput(null)).toBe(null);
      expect(sanitizeInput({})).toEqual({});
      expect(sanitizeInput([])).toEqual([]);
    });

    it('should remove HTML tags', () => {
      expect(sanitizeInput('<script>alert("xss")</script>')).toBe('alert("xss")');
      expect(sanitizeInput('Hello <b>world</b>')).toBe('Hello world');
      expect(sanitizeInput('<div>content</div>')).toBe('content');
    });

    it('should remove javascript: protocol', () => {
      expect(sanitizeInput('javascript:alert("xss")')).toBe('alert("xss")');
      expect(sanitizeInput('JAVASCRIPT:alert("xss")')).toBe('alert("xss")');
      expect(sanitizeInput('JavaScript:alert("xss")')).toBe('alert("xss")');
    });

    it('should trim whitespace', () => {
      expect(sanitizeInput('  hello world  ')).toBe('hello world');
      expect(sanitizeInput('\n\t  content  \t\n')).toBe('content');
    });

    it('should handle combination of sanitization rules', () => {
      const input = '  <script>javascript:alert("xss")</script>  ';
      const expected = 'alert("xss")';

      expect(sanitizeInput(input)).toBe(expected);
    });

    it('should preserve valid content', () => {
      const validInput = 'This is a normal message with punctuation!';

      expect(sanitizeInput(validInput)).toBe(validInput);
    });

    it('should handle empty strings', () => {
      expect(sanitizeInput('')).toBe('');
      expect(sanitizeInput('   ')).toBe('');
    });

    it('should handle mixed case javascript protocol', () => {
      expect(sanitizeInput('JaVaScRiPt:alert(1)')).toBe('alert(1)');
    });

    it('should handle nested HTML tags', () => {
      expect(sanitizeInput('<div><span>nested</span></div>')).toBe('nested');
    });
  });

  describe('integration scenarios', () => {
    it('should validate complete chat request', () => {
      const messages = [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: sanitizeInput('What is <script>JavaScript</script>?') }
      ];
      const options = {
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 500
      };

      expect(() => {
        validateChatMessages(messages);
        validateOptions(options);
      }).not.toThrow();

      expect(messages[1].content).toBe('What is JavaScript?');
    });

    it('should validate tutor request with sanitized input', () => {
      const question = sanitizeInput('Explain <b>functions</b> in JavaScript');
      const context = sanitizeInput('User is learning <script>programming</script>');

      expect(() => {
        validateTutorRequest(question, context);
      }).not.toThrow();

      expect(question).toBe('Explain functions in JavaScript');
      expect(context).toBe('User is learning programming');
    });
  });
});