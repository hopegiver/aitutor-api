/**
 * Test setup file for Vitest
 * Configures global mocks and polyfills for Cloudflare Workers environment
 */

import { vi } from 'vitest';

// Mock Web APIs that are available in Cloudflare Workers but not in Node.js
global.fetch = vi.fn();
global.Request = vi.fn();
global.Response = vi.fn();
global.Headers = vi.fn();
global.ReadableStream = vi.fn();
global.WritableStream = vi.fn();
global.TransformStream = vi.fn();
global.TextEncoder = vi.fn(() => ({
  encode: vi.fn((text) => new Uint8Array(Buffer.from(text, 'utf8')))
}));
global.TextDecoder = vi.fn(() => ({
  decode: vi.fn((bytes) => Buffer.from(bytes).toString('utf8'))
}));

// Mock crypto.subtle for Web Crypto API
global.crypto = {
  subtle: {
    digest: vi.fn(),
    generateKey: vi.fn(),
    importKey: vi.fn(),
    exportKey: vi.fn(),
    sign: vi.fn(),
    verify: vi.fn(),
    encrypt: vi.fn(),
    decrypt: vi.fn(),
    deriveBits: vi.fn(),
    deriveKey: vi.fn(),
    wrapKey: vi.fn(),
    unwrapKey: vi.fn()
  },
  getRandomValues: vi.fn((array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  })
};

// Mock FormData
global.FormData = vi.fn(() => ({
  append: vi.fn(),
  delete: vi.fn(),
  get: vi.fn(),
  getAll: vi.fn(),
  has: vi.fn(),
  set: vi.fn(),
  entries: vi.fn(),
  keys: vi.fn(),
  values: vi.fn(),
  forEach: vi.fn()
}));

// Setup crypto.subtle.digest mock to return consistent hash
global.crypto.subtle.digest.mockImplementation(async (algorithm, data) => {
  // Simple mock hash function for testing
  const input = Array.from(new Uint8Array(data));
  const hash = input.map((byte, index) => (byte + index) % 256);
  return new ArrayBuffer(hash.length);
});

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn()
};

// Setup fetch mock with default implementation
global.fetch.mockImplementation(async (url, options) => {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map(),
    json: async () => ({}),
    text: async () => '',
    blob: async () => new Blob(),
    arrayBuffer: async () => new ArrayBuffer(0),
    body: new ReadableStream()
  };
});

// Setup Request mock
global.Request.mockImplementation((url, options = {}) => ({
  url,
  method: options.method || 'GET',
  headers: options.headers || {},
  body: options.body || null,
  json: async () => JSON.parse(options.body || '{}'),
  text: async () => options.body || '',
  clone: vi.fn()
}));

// Setup Response mock
global.Response.mockImplementation((body, options = {}) => ({
  body,
  status: options.status || 200,
  statusText: options.statusText || 'OK',
  headers: new Map(Object.entries(options.headers || {})),
  ok: (options.status || 200) >= 200 && (options.status || 200) < 300,
  json: async () => JSON.parse(body || '{}'),
  text: async () => body || '',
  clone: vi.fn()
}));

// Setup ReadableStream mock
global.ReadableStream.mockImplementation((source) => ({
  getReader: vi.fn(() => ({
    read: vi.fn(),
    releaseLock: vi.fn(),
    cancel: vi.fn()
  })),
  cancel: vi.fn(),
  locked: false,
  pipeThrough: vi.fn(),
  pipeTo: vi.fn(),
  tee: vi.fn()
}));

// Reset all mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});