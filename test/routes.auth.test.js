/**
 * Auth Route Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import auth from '../src/routes/auth.js';

// Mock dependencies
vi.mock('../src/utils/auth.js', () => ({
  AuthService: vi.fn()
}));

vi.mock('../src/utils/responses.js', () => ({
  createErrorResponse: vi.fn((message, status, code) => ({
    error: message,
    code: code || 'ERROR',
    timestamp: new Date().toISOString()
  }))
}));

vi.mock('../src/utils/validation.js', () => ({
  sanitizeInput: vi.fn((input) => input.toString().trim())
}));

import { AuthService } from '../src/utils/auth.js';
import { createErrorResponse } from '../src/utils/responses.js';
import { sanitizeInput } from '../src/utils/validation.js';

describe('Auth Routes', () => {
  let app;
  let mockAuthService;
  let mockEnv;

  beforeEach(() => {
    // Setup app with auth routes
    app = new Hono();
    app.route('/auth', auth);

    // Mock environment
    mockEnv = {
      AUTH_SECRET_KEY: 'test-auth-secret',
      JWT_SECRET: 'test-jwt-secret'
    };

    // Mock AuthService
    mockAuthService = {
      verifyDomain: vi.fn(),
      generateJWT: vi.fn(),
      getDomainInfo: vi.fn()
    };

    AuthService.mockImplementation(() => mockAuthService);

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe('POST /auth', () => {
    it('should authenticate valid domain and auth key', async () => {
      // Mock successful responses
      mockAuthService.verifyDomain.mockResolvedValue(true);
      mockAuthService.generateJWT.mockResolvedValue('mock-jwt-token');
      mockAuthService.getDomainInfo.mockReturnValue({
        tier: 'standard',
        maxRequestsPerDay: 1000,
        features: ['chat', 'quiz']
      });

      const req = new Request('http://localhost/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'example.com',
          authKey: 'valid-auth-key'
        })
      });

      const res = await app.request(req, mockEnv);
      const result = await res.json();

      expect(res.status).toBe(200);
      expect(result).toEqual({
        success: true,
        token: 'mock-jwt-token',
        domain: 'example.com',
        domainInfo: {
          tier: 'standard',
          maxRequestsPerDay: 1000,
          features: ['chat', 'quiz']
        }
      });

      expect(sanitizeInput).toHaveBeenCalledWith('example.com');
      expect(sanitizeInput).toHaveBeenCalledWith('valid-auth-key');
      expect(mockAuthService.verifyDomain).toHaveBeenCalledWith('example.com', 'valid-auth-key');
    });

    it('should return 400 for missing domain', async () => {
      const req = new Request('http://localhost/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authKey: 'valid-auth-key'
        })
      });

      const res = await app.request(req, mockEnv);

      expect(res.status).toBe(400);
      expect(createErrorResponse).toHaveBeenCalledWith('Domain is required and must be a string');
    });

    it('should return 400 for missing auth key', async () => {
      const req = new Request('http://localhost/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'example.com'
        })
      });

      const res = await app.request(req, mockEnv);

      expect(res.status).toBe(400);
      expect(createErrorResponse).toHaveBeenCalledWith('Auth key is required and must be a string');
    });

    it('should return 400 for invalid domain type', async () => {
      const req = new Request('http://localhost/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 123,
          authKey: 'valid-auth-key'
        })
      });

      const res = await app.request(req, mockEnv);

      expect(res.status).toBe(400);
      expect(createErrorResponse).toHaveBeenCalledWith('Domain is required and must be a string');
    });

    it('should return 400 for invalid auth key type', async () => {
      const req = new Request('http://localhost/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'example.com',
          authKey: 123
        })
      });

      const res = await app.request(req, mockEnv);

      expect(res.status).toBe(400);
      expect(createErrorResponse).toHaveBeenCalledWith('Auth key is required and must be a string');
    });

    it('should return 500 for missing AUTH_SECRET_KEY', async () => {
      const envWithoutAuthSecret = { JWT_SECRET: 'test-jwt-secret' };

      const req = new Request('http://localhost/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'example.com',
          authKey: 'valid-auth-key'
        })
      });

      const res = await app.request(req, envWithoutAuthSecret);

      expect(res.status).toBe(500);
      expect(createErrorResponse).toHaveBeenCalledWith('Authentication service not configured');
    });

    it('should return 500 for missing JWT_SECRET', async () => {
      const envWithoutJwtSecret = { AUTH_SECRET_KEY: 'test-auth-secret' };

      const req = new Request('http://localhost/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'example.com',
          authKey: 'valid-auth-key'
        })
      });

      const res = await app.request(req, envWithoutJwtSecret);

      expect(res.status).toBe(500);
      expect(createErrorResponse).toHaveBeenCalledWith('JWT service not configured');
    });

    it('should return 400 for invalid domain format', async () => {
      sanitizeInput.mockImplementation((input) => {
        if (input === 'invalid..domain') return 'invalid..domain';
        return input.toString().trim();
      });

      const req = new Request('http://localhost/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'invalid..domain',
          authKey: 'valid-auth-key'
        })
      });

      const res = await app.request(req, mockEnv);

      expect(res.status).toBe(400);
      expect(createErrorResponse).toHaveBeenCalledWith('Invalid domain format');
    });

    it('should return 401 for failed domain verification', async () => {
      mockAuthService.verifyDomain.mockResolvedValue(false);

      const req = new Request('http://localhost/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'example.com',
          authKey: 'invalid-auth-key'
        })
      });

      const res = await app.request(req, mockEnv);

      expect(res.status).toBe(401);
      expect(createErrorResponse).toHaveBeenCalledWith('Domain verification failed');
      expect(mockAuthService.verifyDomain).toHaveBeenCalledWith('example.com', 'invalid-auth-key');
    });

    it('should handle domain and auth key sanitization', async () => {
      sanitizeInput.mockImplementation((input) => {
        return input.toString().trim().toLowerCase();
      });

      mockAuthService.verifyDomain.mockResolvedValue(true);
      mockAuthService.generateJWT.mockResolvedValue('mock-jwt-token');
      mockAuthService.getDomainInfo.mockReturnValue({
        tier: 'standard',
        maxRequestsPerDay: 1000,
        features: ['chat', 'quiz']
      });

      const req = new Request('http://localhost/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: '  EXAMPLE.COM  ',
          authKey: '  VALID-AUTH-KEY  '
        })
      });

      const res = await app.request(req, mockEnv);

      expect(res.status).toBe(200);
      expect(sanitizeInput).toHaveBeenCalledWith('  EXAMPLE.COM  ');
      expect(sanitizeInput).toHaveBeenCalledWith('  VALID-AUTH-KEY  ');
      expect(mockAuthService.verifyDomain).toHaveBeenCalledWith('example.com', 'valid-auth-key');
    });

    it('should handle AuthService instantiation with correct parameters', async () => {
      mockAuthService.verifyDomain.mockResolvedValue(true);
      mockAuthService.generateJWT.mockResolvedValue('mock-jwt-token');
      mockAuthService.getDomainInfo.mockReturnValue({
        tier: 'standard',
        maxRequestsPerDay: 1000,
        features: ['chat', 'quiz']
      });

      const req = new Request('http://localhost/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'example.com',
          authKey: 'valid-auth-key'
        })
      });

      await app.request(req, mockEnv);

      expect(AuthService).toHaveBeenCalledWith('test-auth-secret', 'test-jwt-secret');
    });

    it('should handle JSON parsing errors', async () => {
      const req = new Request('http://localhost/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      });

      const res = await app.request(req, mockEnv);

      expect(res.status).toBe(500);
    });

    it('should handle empty request body', async () => {
      const req = new Request('http://localhost/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const res = await app.request(req, mockEnv);

      expect(res.status).toBe(400);
      expect(createErrorResponse).toHaveBeenCalledWith('Domain is required and must be a string');
    });
  });

  describe('Domain validation', () => {
    const testDomains = [
      { domain: 'example.com', valid: true },
      { domain: 'sub.example.com', valid: true },
      { domain: 'localhost', valid: true },
      { domain: 'test-domain.co.uk', valid: true },
      { domain: '', valid: false },
      { domain: '.example.com', valid: false },
      { domain: 'example..com', valid: false },
      { domain: 'example.com.', valid: false },
      { domain: '-example.com', valid: false },
      { domain: 'example-.com', valid: false }
    ];

    testDomains.forEach(({ domain, valid }) => {
      it(`should ${valid ? 'accept' : 'reject'} domain: ${domain}`, async () => {
        sanitizeInput.mockReturnValue(domain);

        if (valid) {
          mockAuthService.verifyDomain.mockResolvedValue(true);
          mockAuthService.generateJWT.mockResolvedValue('mock-jwt-token');
          mockAuthService.getDomainInfo.mockReturnValue({
            tier: 'standard',
            maxRequestsPerDay: 1000,
            features: ['chat', 'quiz']
          });
        }

        const req = new Request('http://localhost/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            domain: domain,
            authKey: 'valid-auth-key'
          })
        });

        const res = await app.request(req, mockEnv);

        if (valid) {
          expect(res.status).toBe(200);
        } else {
          expect(res.status).toBe(400);
          expect(createErrorResponse).toHaveBeenCalledWith('Invalid domain format');
        }
      });
    });
  });
});