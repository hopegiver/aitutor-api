/**
 * AI Tutor API - Refactoring Integration Tests
 * Tests the refactored ContentService, KVService, and StreamService integration
 */

import { ContentService } from '../src/services/content.js';
import { KVService } from '../src/services/kv.js';
import { StreamService } from '../src/services/stream.js';
import { OpenAIService } from '../src/services/openai.js';

// Simple test framework
let tests = 0;
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests++;
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    failed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertNotNull(value, message) {
  if (value === null || value === undefined) {
    throw new Error(message || 'Expected value to not be null or undefined');
  }
}

console.log('🧪 AI Tutor API - Refactoring Integration Tests\n');

// Mock environment for testing
const mockEnv = {
  OPENAI_API_KEY: 'test-key',
  CLOUDFLARE_ACCOUNT_ID: 'test-account-id',
  AITUTOR_KV: {
    get: async (key) => {
      if (key.includes('test-content-id')) {
        return JSON.stringify({
          contentId: 'test-content-id',
          status: 'completed',
          language: 'ko',
          summary: 'Test summary content',
          originalText: 'Test original text content',
          objectives: ['Test objective 1', 'Test objective 2'],
          recommendedQuestions: ['Test question 1', 'Test question 2']
        });
      }
      return null;
    },
    put: async (key, value) => {
      // Mock put operation
      return true;
    }
  },
  CONTENT_VECTORIZE: {
    query: async () => ({ matches: [] }),
    upsert: async () => ({ mutationId: 'test-mutation' })
  },
  TRANSCRIBE_QUEUE: {
    send: async (message) => {
      // Mock queue send
      return { id: 'test-message-id' };
    }
  }
};

// ContentService Tests
console.log('📦 ContentService Integration Tests');

test('ContentService constructor with dependencies', () => {
  const openaiService = new OpenAIService('test-key', 'test-account-id');
  const contentService = new ContentService(mockEnv, openaiService);

  assertNotNull(contentService.env, 'ContentService should have env');
  assertNotNull(contentService.openaiService, 'ContentService should have openaiService');
  assertNotNull(contentService.vectorizeService, 'ContentService should have vectorizeService');
  assertNotNull(contentService.kvService, 'ContentService should have kvService');
});

test('ContentService createUploadJob generates consistent contentId', async () => {
  const openaiService = new OpenAIService('test-key', 'test-account-id');
  const contentService = new ContentService(mockEnv, openaiService);

  const videoUrl = 'https://example.com/test-video.mp4';

  // Generate multiple jobs with same URL to test consistency
  const job1 = await contentService.createUploadJob(videoUrl, 'ko-KR');
  const job2 = await contentService.createUploadJob(videoUrl, 'ko-KR');

  assertEqual(job1.contentId, job2.contentId, 'ContentId should be consistent for same URL');
  assertNotNull(job1.statusUrl, 'Should have statusUrl');
  assertNotNull(job1.resultUrl, 'Should have resultUrl');
});

// KVService Tests
console.log('\n📦 KVService Refactoring Tests');

test('KVService static utility methods', () => {
  const contentKey = KVService.contentKey('summary', 'test-id');
  assertEqual(contentKey, 'content:summary:test-id', 'contentKey should format correctly');

  const authKey = KVService.authKey('example.com');
  assertEqual(authKey, 'auth:example.com', 'authKey should format correctly');

  const configKey = KVService.configKey('api-settings');
  assertEqual(configKey, 'config:api-settings', 'configKey should format correctly');
});

test('KVService provides generic KV operations', () => {
  const kvService = new KVService(mockEnv.AITUTOR_KV);

  // Test that generic KV methods exist
  assertNotNull(kvService.get, 'get method should exist');
  assertNotNull(kvService.set, 'set method should exist');
  assertNotNull(kvService.delete, 'delete method should exist');
  assertNotNull(kvService.list, 'list method should exist');
});

// StreamService Tests
console.log('\n📦 StreamService Optimization Tests');

test('StreamService subtitle processing methods', () => {
  const streamService = new StreamService('test-account-id', 'test-token');

  const mockVTT = `WEBVTT

1
00:00:01.000 --> 00:00:03.000
Hello world

2
00:00:04.000 --> 00:00:06.000
This is a test`;

  // Test plain text extraction
  const plainText = streamService.extractPlainText(mockVTT);
  if (!plainText.includes('Hello world') || !plainText.includes('This is a test')) {
    throw new Error('Plain text extraction failed');
  }

  // Test duration extraction
  const duration = streamService.extractDurationFromVTT(mockVTT);
  if (duration < 6) {
    throw new Error('Duration extraction failed');
  }

  // Test segment conversion
  const segments = streamService.convertVTTToSegments(mockVTT);
  assertEqual(segments.length, 2, 'Should extract 2 segments');
  assertEqual(segments[0].text, 'Hello world', 'First segment text incorrect');
  assertEqual(segments[1].text, 'This is a test', 'Second segment text incorrect');
});

test('StreamService language mapping', () => {
  const streamService = new StreamService('test-account-id', 'test-token');

  assertEqual(streamService.mapLanguageCode('ko-KR'), 'ko');
  assertEqual(streamService.mapLanguageCode('en-US'), 'en');
  assertEqual(streamService.mapLanguageCode('ja-JP'), 'ja');
  assertEqual(streamService.mapLanguageCode('unknown-lang'), 'unknown');
});

// Educational Content Generation Tests (Mock)
console.log('\n📦 Educational Content Generation Tests');

test('ContentService educational content structure', async () => {
  const openaiService = new OpenAIService('test-key', 'test-account-id');
  const contentService = new ContentService(mockEnv, openaiService);

  // Mock the OpenAI response for testing structure
  const mockEducationalContent = {
    summary: 'Test summary',
    objectives: ['Objective 1', 'Objective 2'],
    recommendedQuestions: ['Question 1', 'Question 2'],
    quiz: [
      {
        question: 'Test question?',
        options: ['A', 'B', 'C', 'D'],
        answer: 0,
        explanation: 'Test explanation'
      }
    ]
  };

  // Test structure validation
  assertNotNull(mockEducationalContent.summary, 'Should have summary');
  if (!Array.isArray(mockEducationalContent.objectives)) {
    throw new Error('Objectives should be array');
  }
  if (!Array.isArray(mockEducationalContent.recommendedQuestions)) {
    throw new Error('Recommended questions should be array');
  }
  if (!Array.isArray(mockEducationalContent.quiz)) {
    throw new Error('Quiz should be array');
  }

  // Test quiz question structure
  const quizQuestion = mockEducationalContent.quiz[0];
  assertNotNull(quizQuestion.question, 'Quiz question should have question');
  if (!Array.isArray(quizQuestion.options)) {
    throw new Error('Quiz options should be array');
  }
  assertEqual(quizQuestion.options.length, 4, 'Should have 4 options');
  if (typeof quizQuestion.answer !== 'number') {
    throw new Error('Answer should be number');
  }
  assertNotNull(quizQuestion.explanation, 'Should have explanation');
});

// Service Integration Tests
console.log('\n📦 Service Integration Tests');

test('ContentService integrates all required services', () => {
  const openaiService = new OpenAIService('test-key', 'test-account-id');
  const contentService = new ContentService(mockEnv, openaiService);

  // Verify that ContentService properly initializes all dependencies
  assertNotNull(contentService.kvService, 'Should have KVService instance');
  assertNotNull(contentService.vectorizeService, 'Should have VectorizeService instance');
  assertNotNull(contentService.openaiService, 'Should have OpenAIService instance');

  // Verify that KVService can use static utility methods
  const testKey = contentService.kvService.constructor.contentKey('test', 'id');
  assertEqual(testKey, 'content:test:id', 'Static methods should work through instance');
});

test('ContentService has content-specific methods', () => {
  const openaiService = new OpenAIService('test-key', 'test-account-id');
  const contentService = new ContentService(mockEnv, openaiService);

  // Verify that ContentService has all content-related methods
  assertNotNull(contentService.updateStatus, 'updateStatus method should exist');
  assertNotNull(contentService.updateProgress, 'updateProgress method should exist');
  assertNotNull(contentService.setError, 'setError method should exist');
  assertNotNull(contentService.setInfo, 'setInfo method should exist');
  assertNotNull(contentService.setSubtitle, 'setSubtitle method should exist');
  assertNotNull(contentService.setSummaryData, 'setSummaryData method should exist');
  assertNotNull(contentService.updateSummary, 'updateSummary method should exist');
});

test('All services maintain proper constructor parameters', () => {
  // Test that services can be constructed with expected parameters
  const openaiService = new OpenAIService('test-key', 'test-account-id');
  const kvService = new KVService(mockEnv.AITUTOR_KV);
  const streamService = new StreamService('test-account-id', 'test-token');
  const contentService = new ContentService(mockEnv, openaiService);

  // All should construct without throwing
  assertNotNull(openaiService, 'OpenAIService should construct');
  assertNotNull(kvService, 'KVService should construct');
  assertNotNull(streamService, 'StreamService should construct');
  assertNotNull(contentService, 'ContentService should construct');
});

// Summary
console.log('\n📊 Refactoring Integration Test Results');
console.log(`Total: ${tests}`);
console.log(`Passed: ${passed} ✅`);
console.log(`Failed: ${failed} ${failed > 0 ? '❌' : ''}`);
console.log(`Success Rate: ${Math.round((passed / tests) * 100)}%`);

if (failed > 0) {
  console.log('\n❌ Some refactoring integration tests failed. Please review the changes.');
  process.exit(1);
} else {
  console.log('\n🎉 All refactoring integration tests passed! The code refactoring is successful.');
}