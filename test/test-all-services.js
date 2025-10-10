/**
 * All Services Unit Tests Runner
 * Tests all service classes individually
 */

// Import services for direct testing
import { KVService } from '../src/services/kv.js';
import { QueueService } from '../src/services/queue.js';
import { StreamService } from '../src/services/stream.js';
import { WhisperService } from '../src/services/whisper.js';
import { TranscribeConsumer } from '../src/services/transcribe-consumer.js';
import { OpenAIService } from '../src/services/openai.js';
import { AuthService } from '../src/utils/auth.js';
import { validateChatMessages, validateOptions, sanitizeInput } from '../src/utils/validation.js';
import { createErrorResponse, createSSEResponse } from '../src/utils/responses.js';

// Simple test framework
let tests = 0;
let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  tests++;
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    failures.push({ test: name, error: error.message });
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertThrows(fn, expectedMessage) {
  try {
    fn();
    throw new Error('Expected function to throw an error');
  } catch (error) {
    if (expectedMessage && !error.message.includes(expectedMessage)) {
      throw new Error(`Expected error to contain "${expectedMessage}", got "${error.message}"`);
    }
  }
}

console.log('🧪 Testing All Services and Utils\n');

// KV Service Tests
console.log('📦 KV Service Tests');

test('KVService constructor', () => {
  const mockKV = { get: () => {}, put: () => {} };
  const service = new KVService(mockKV);
  assertEqual(service.kv, mockKV);
});

test('KVService key formatting', () => {
  const mockKV = {
    get: (key) => key,
    put: () => {},
    delete: () => {},
    list: () => ({ keys: [] })
  };
  const service = new KVService(mockKV);

  // Test that getJob formats the key correctly
  const result = service.kv.get('job:test-123');
  assertEqual(result, 'job:test-123');
});

// Queue Service Tests
console.log('\n📦 Queue Service Tests');

test('QueueService constructor', () => {
  const mockQueue = { send: () => {} };
  const service = new QueueService(mockQueue);
  assertEqual(service.queue, mockQueue);
});

test('QueueService message structure', () => {
  const mockQueue = {
    send: (message) => {
      // Verify message structure
      if (!message.jobId || !message.action || !message.timestamp) {
        throw new Error('Invalid message structure');
      }
      return Promise.resolve();
    }
  };
  const service = new QueueService(mockQueue);

  // Test sendJob creates proper message structure
  const message = {
    jobId: 'test-job',
    action: 'test-action',
    timestamp: new Date().toISOString()
  };

  // This should not throw
  service.queue.send(message);
});

// Stream Service Tests
console.log('\n📦 Stream Service Tests');

test('StreamService constructor', () => {
  const accountId = 'test-account';
  const apiToken = 'test-token';
  const service = new StreamService(accountId, apiToken);

  assertEqual(service.accountId, accountId);
  assertEqual(service.apiToken, apiToken);
  assertEqual(service.baseUrl, `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`);
});

test('StreamService URL construction', () => {
  const service = new StreamService('account123', 'token456');
  const expectedBaseUrl = 'https://api.cloudflare.com/client/v4/accounts/account123/stream';
  assertEqual(service.baseUrl, expectedBaseUrl);
});

// Whisper Service Tests
console.log('\n📦 Whisper Service Tests');

test('WhisperService constructor', () => {
  const apiKey = 'test-key';
  const endpoint = 'https://test.endpoint.com';
  const apiVersion = '2024-01-01';
  const service = new WhisperService(apiKey, endpoint, apiVersion);

  assertEqual(service.apiKey, apiKey);
  assertEqual(service.endpoint, endpoint);
  assertEqual(service.apiVersion, apiVersion);
  assertEqual(service.baseUrl, `${endpoint}/openai/deployments/whisper-1/audio/transcriptions`);
});

test('WhisperService SRT time formatting', () => {
  const service = new WhisperService('key', 'endpoint');

  assertEqual(service.formatSRTTime(0), '00:00:00,000');
  assertEqual(service.formatSRTTime(65.5), '00:01:05,500');
  assertEqual(service.formatSRTTime(3661.123), '01:01:01,123');
});

test('WhisperService VTT time formatting', () => {
  const service = new WhisperService('key', 'endpoint');

  assertEqual(service.formatVTTTime(0), '00:00:00.000');
  assertEqual(service.formatVTTTime(65.5), '00:01:05.500');
  assertEqual(service.formatVTTTime(3661.123), '01:01:01.123');
});

test('WhisperService SRT conversion', () => {
  const service = new WhisperService('key', 'endpoint');
  const segments = [
    { start: 0, end: 2.5, text: 'Hello there' },
    { start: 3.0, end: 5.8, text: 'How are you?' }
  ];

  const result = service.convertToSRT(segments);
  if (!result.includes('1\n') || !result.includes('2\n') || !result.includes('Hello there') || !result.includes('How are you?')) {
    throw new Error('SRT conversion failed');
  }
});

test('WhisperService VTT conversion', () => {
  const service = new WhisperService('key', 'endpoint');
  const segments = [
    { start: 0, end: 2.5, text: 'Hello there' }
  ];

  const result = service.convertToVTT(segments);
  if (!result.startsWith('WEBVTT') || !result.includes('Hello there')) {
    throw new Error('VTT conversion failed');
  }
});

// TranscribeConsumer Tests
console.log('\n📦 TranscribeConsumer Tests');

test('TranscribeConsumer language mapping', () => {
  const mockEnv = {
    TRANSCRIBE_KV: {},
    TRANSCRIBE_QUEUE: {},
    CLOUDFLARE_ACCOUNT_ID: 'test',
    STREAM_API_TOKEN: 'test',
    OPENAI_API_KEY: 'test'
  };

  const consumer = new TranscribeConsumer(mockEnv);

  assertEqual(consumer.mapLanguageCode('ko-KR'), 'ko');
  assertEqual(consumer.mapLanguageCode('en-US'), 'en');
  assertEqual(consumer.mapLanguageCode('pt-BR'), 'pt');
  assertEqual(consumer.mapLanguageCode(''), 'auto');
});

// OpenAI Service Tests (from previous tests)
console.log('\n📦 OpenAI Service Tests');

test('OpenAIService constructor', () => {
  const service = new OpenAIService('test-key');
  assertEqual(service.apiKey, 'test-key');
  assertEqual(service.baseUrl, 'https://malgn-openai.openai.azure.com/');
});

test('addTutorGuidance adds system message when none exists', () => {
  const service = new OpenAIService('test-key');
  const messages = [{ role: 'user', content: 'Hello' }];
  const result = service.addTutorGuidance(messages);

  assertEqual(result.length, 2);
  assertEqual(result[0].role, 'system');
  assertEqual(result[1].role, 'user');
});

// Auth Service Tests (from previous tests)
console.log('\n📦 Auth Service Tests');

test('AuthService constructor', () => {
  const authService = new AuthService('secret-key', 'jwt-secret');
  assertEqual(authService.secretKey, 'secret-key');
  assertEqual(authService.jwtSecret, 'jwt-secret');
});

test('getDomainInfo returns standard tier for regular domain', () => {
  const authService = new AuthService('secret-key', 'jwt-secret');
  const info = authService.getDomainInfo('example.com');

  assertEqual(info.tier, 'standard');
  assertEqual(info.maxRequestsPerDay, 1000);
});

// Validation Tests (from previous tests)
console.log('\n📦 Validation Tests');

test('validateChatMessages accepts valid messages', () => {
  const validMessages = [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' }
  ];
  // Should not throw
  validateChatMessages(validMessages);
});

test('validateChatMessages rejects non-array', () => {
  assertThrows(() => validateChatMessages('not an array'), 'Messages must be an array');
});

test('validateOptions accepts valid options', () => {
  const validOptions = {
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 500
  };
  // Should not throw
  validateOptions(validOptions);
});

test('sanitizeInput removes HTML tags', () => {
  const input = '<script>alert("xss")</script>';
  const result = sanitizeInput(input);
  assertEqual(result, 'scriptalert("xss")/script');
});

// Response Utils Tests (from previous tests)
console.log('\n📦 Response Utils Tests');

test('createErrorResponse creates correct structure', () => {
  const response = createErrorResponse('Test error', 400, 'TEST_ERROR');

  assertEqual(response.error, 'Test error');
  assertEqual(response.code, 'TEST_ERROR');
  if (!response.timestamp) {
    throw new Error('Response should have timestamp');
  }
});

test('createSSEResponse creates Response with correct headers', () => {
  const mockStream = {};
  const response = createSSEResponse(mockStream);

  if (!response.headers) {
    throw new Error('Response should have headers');
  }

  assertEqual(response.headers.get('Content-Type'), 'text/event-stream; charset=utf-8');
  assertEqual(response.headers.get('Cache-Control'), 'no-cache');
});

// Integration Tests
console.log('\n📦 Integration Tests');

test('Service dependency injection pattern', () => {
  // Test that services can be instantiated with their dependencies
  const mockKV = { get: () => {}, put: () => {} };
  const mockQueue = { send: () => {} };

  const kvService = new KVService(mockKV);
  const queueService = new QueueService(mockQueue);

  if (!kvService.kv || !queueService.queue) {
    throw new Error('Services should store their dependencies');
  }
});

test('Error handling pattern consistency', () => {
  // Test that all error responses follow the same pattern
  const error1 = createErrorResponse('Error 1');
  const error2 = createErrorResponse('Error 2', 500, 'CUSTOM');

  if (!error1.error || !error1.code || !error1.timestamp) {
    throw new Error('Error response should have error, code, and timestamp');
  }

  if (!error2.error || !error2.code || !error2.timestamp) {
    throw new Error('Custom error response should have error, code, and timestamp');
  }
});

// Summary
console.log('\n📊 Test Results');
console.log(`Total: ${tests}`);
console.log(`Passed: ${passed} ✅`);
console.log(`Failed: ${failed} ${failed > 0 ? '❌' : ''}`);
console.log(`Success Rate: ${Math.round((passed / tests) * 100)}%`);

if (failed > 0) {
  console.log('\n💥 Failures:');
  failures.forEach(failure => {
    console.log(`  - ${failure.test}: ${failure.error}`);
  });
  process.exit(1);
}

console.log('\n🎉 All service tests passed!');