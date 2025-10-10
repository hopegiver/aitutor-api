/**
 * Direct Service Testing
 * Tests individual services and utilities directly
 */

import { OpenAIService } from '../src/services/openai.js';
import { AuthService } from '../src/utils/auth.js';
import { validateChatMessages, validateOptions, sanitizeInput } from '../src/utils/validation.js';
import { createErrorResponse, createSSEResponse } from '../src/utils/responses.js';

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

console.log('🧪 Testing Services and Utils\n');

// OpenAI Service Tests
console.log('📦 OpenAI Service Tests');

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

test('addTutorGuidance modifies existing system message', () => {
  const service = new OpenAIService('test-key');
  const messages = [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'Hello' }
  ];
  const result = service.addTutorGuidance(messages);

  assertEqual(result.length, 2);
  assertEqual(result[0].role, 'system');
  if (!result[0].content.includes('As an AI tutor')) {
    throw new Error('System message should include tutor guidance');
  }
});

// Auth Service Tests
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
  if (!Array.isArray(info.features)) {
    throw new Error('Features should be an array');
  }
});

test('getDomainInfo returns premium tier for premium domain', () => {
  const authService = new AuthService('secret-key', 'jwt-secret');
  const info = authService.getDomainInfo('premium.example.com');

  assertEqual(info.tier, 'premium');
  assertEqual(info.maxRequestsPerDay, 10000);
});

// Validation Tests
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

test('validateChatMessages rejects empty array', () => {
  assertThrows(() => validateChatMessages([]), 'Messages array cannot be empty');
});

test('validateChatMessages rejects invalid role', () => {
  const invalidMessages = [{ role: 'invalid', content: 'Hello' }];
  assertThrows(() => validateChatMessages(invalidMessages), 'Invalid role');
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

test('validateOptions rejects invalid temperature', () => {
  assertThrows(() => validateOptions({ temperature: 3 }), 'Temperature must be a number between 0 and 2');
});

test('validateOptions rejects invalid maxTokens', () => {
  assertThrows(() => validateOptions({ maxTokens: 5000 }), 'Max tokens must be a number between 1 and 4000');
});

test('sanitizeInput removes HTML tags', () => {
  const input = '<script>alert("xss")</script>';
  const result = sanitizeInput(input);
  assertEqual(result, 'scriptalert("xss")/script');
});

test('sanitizeInput removes javascript protocol', () => {
  const input = 'javascript:alert("xss")';
  const result = sanitizeInput(input);
  assertEqual(result, 'alert("xss")');
});

test('sanitizeInput trims whitespace', () => {
  const input = '  hello world  ';
  const result = sanitizeInput(input);
  assertEqual(result, 'hello world');
});

test('sanitizeInput preserves non-string input', () => {
  const input = 123;
  const result = sanitizeInput(input);
  assertEqual(result, 123);
});

// Response Utils Tests
console.log('\n📦 Response Utils Tests');

test('createErrorResponse creates correct structure', () => {
  const response = createErrorResponse('Test error', 400, 'TEST_ERROR');

  assertEqual(response.error, 'Test error');
  assertEqual(response.code, 'TEST_ERROR');
  if (!response.timestamp) {
    throw new Error('Response should have timestamp');
  }
});

test('createErrorResponse uses default values', () => {
  const response = createErrorResponse('Test error');

  assertEqual(response.error, 'Test error');
  assertEqual(response.code, 'ERROR');
});

test('createSSEResponse creates Response with correct headers', () => {
  const mockStream = {};
  const response = createSSEResponse(mockStream);

  if (!response.headers) {
    throw new Error('Response should have headers');
  }

  assertEqual(response.headers.get('Content-Type'), 'text/event-stream; charset=utf-8');
  assertEqual(response.headers.get('Cache-Control'), 'no-cache');
  assertEqual(response.headers.get('Connection'), 'keep-alive');
});

// Domain validation test
console.log('\n📦 Domain Validation Tests');

test('Domain regex validation', () => {
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/;

  // Valid domains
  if (!domainRegex.test('example.com')) throw new Error('Should accept example.com');
  if (!domainRegex.test('sub.example.com')) throw new Error('Should accept sub.example.com');
  if (!domainRegex.test('localhost')) throw new Error('Should accept localhost');
  if (!domainRegex.test('test-domain.co.uk')) throw new Error('Should accept test-domain.co.uk');

  // Invalid domains
  if (domainRegex.test('.example.com')) throw new Error('Should reject .example.com');
  if (domainRegex.test('example..com')) throw new Error('Should reject example..com');
  if (domainRegex.test('-example.com')) throw new Error('Should reject -example.com');
  if (domainRegex.test('example-.com')) throw new Error('Should reject example-.com');
});

// Summary
console.log('\n📊 Test Results');
console.log(`Total: ${tests}`);
console.log(`Passed: ${passed} ✅`);
console.log(`Failed: ${failed} ${failed > 0 ? '❌' : ''}`);
console.log(`Success Rate: ${Math.round((passed / tests) * 100)}%`);

if (failed > 0) {
  process.exit(1);
}