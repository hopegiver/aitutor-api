/**
 * Auth Service Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from '../src/utils/auth.js';

// Mock hono/jwt
vi.mock('hono/jwt', () => ({
  sign: vi.fn(),
  verify: vi.fn()
}));

import { sign, verify } from 'hono/jwt';

describe('AuthService', () => {
  let authService;
  const mockSecretKey = 'test-secret-key';
  const mockJwtSecret = 'test-jwt-secret';

  beforeEach(() => {
    authService = new AuthService(mockSecretKey, mockJwtSecret);
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with secret key and JWT secret', () => {
      expect(authService.secretKey).toBe(mockSecretKey);
      expect(authService.jwtSecret).toBe(mockJwtSecret);
    });
  });

  describe('generateDomainHash', () => {
    it('should generate consistent hash for same domain', async () => {
      const domain = 'example.com';

      const hash1 = await authService.generateDomainHash(domain);
      const hash2 = await authService.generateDomainHash(domain);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex string
    });

    it('should generate different hashes for different domains', async () => {
      const domain1 = 'example1.com';
      const domain2 = 'example2.com';

      const hash1 = await authService.generateDomainHash(domain1);
      const hash2 = await authService.generateDomainHash(domain2);

      expect(hash1).not.toBe(hash2);
    });

    it('should include secret key in hash generation', async () => {
      const domain = 'test.com';
      const authService1 = new AuthService('secret1', mockJwtSecret);
      const authService2 = new AuthService('secret2', mockJwtSecret);

      const hash1 = await authService1.generateDomainHash(domain);
      const hash2 = await authService2.generateDomainHash(domain);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyDomain', () => {
    it('should return true for correct domain and auth key', async () => {
      const domain = 'test.com';
      const correctHash = await authService.generateDomainHash(domain);

      const result = await authService.verifyDomain(domain, correctHash);

      expect(result).toBe(true);
    });

    it('should return false for incorrect auth key', async () => {
      const domain = 'test.com';
      const incorrectHash = 'wrong-hash';

      const result = await authService.verifyDomain(domain, incorrectHash);

      expect(result).toBe(false);
    });

    it('should return false for correct hash but different domain', async () => {
      const domain1 = 'test1.com';
      const domain2 = 'test2.com';
      const hash1 = await authService.generateDomainHash(domain1);

      const result = await authService.verifyDomain(domain2, hash1);

      expect(result).toBe(false);
    });
  });

  describe('generateJWT', () => {
    it('should call sign with correct payload structure', async () => {
      const mockToken = 'mock-jwt-token';
      sign.mockResolvedValue(mockToken);

      const domain = 'test.com';
      const result = await authService.generateJWT(domain);

      expect(sign).toHaveBeenCalledWith(
        expect.objectContaining({
          domain,
          iat: expect.any(Number),
          exp: expect.any(Number)
        }),
        mockJwtSecret
      );
      expect(result).toBe(mockToken);
    });

    it('should set expiration time to 24 hours from now', async () => {
      const mockToken = 'mock-jwt-token';
      sign.mockResolvedValue(mockToken);

      const beforeTime = Math.floor(Date.now() / 1000);
      await authService.generateJWT('test.com');
      const afterTime = Math.floor(Date.now() / 1000);

      const payload = sign.mock.calls[0][0];
      expect(payload.exp - payload.iat).toBe(24 * 60 * 60); // 24 hours
      expect(payload.iat).toBeGreaterThanOrEqual(beforeTime);
      expect(payload.iat).toBeLessThanOrEqual(afterTime);
    });

    it('should include additional info in payload', async () => {
      const mockToken = 'mock-jwt-token';
      sign.mockResolvedValue(mockToken);

      const domain = 'test.com';
      const additionalInfo = { userId: 123, role: 'admin' };

      await authService.generateJWT(domain, additionalInfo);

      const payload = sign.mock.calls[0][0];
      expect(payload.userId).toBe(123);
      expect(payload.role).toBe('admin');
    });
  });

  describe('verifyJWT', () => {
    it('should return payload for valid non-expired token', async () => {
      const mockPayload = {
        domain: 'test.com',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
      };
      verify.mockResolvedValue(mockPayload);

      const token = 'valid-token';
      const result = await authService.verifyJWT(token);

      expect(verify).toHaveBeenCalledWith(token, mockJwtSecret);
      expect(result).toEqual(mockPayload);
    });

    it('should throw error for expired token', async () => {
      const mockPayload = {
        domain: 'test.com',
        iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
        exp: Math.floor(Date.now() / 1000) - 3600  // 1 hour ago (expired)
      };
      verify.mockResolvedValue(mockPayload);

      const token = 'expired-token';

      await expect(authService.verifyJWT(token)).rejects.toThrow('Invalid token: Token expired');
    });

    it('should throw error for invalid token', async () => {
      verify.mockRejectedValue(new Error('Invalid signature'));

      const token = 'invalid-token';

      await expect(authService.verifyJWT(token)).rejects.toThrow('Invalid token: Invalid signature');
    });
  });

  describe('authenticate', () => {
    let mockContext;

    beforeEach(() => {
      mockContext = {
        req: {
          header: vi.fn()
        }
      };
    });

    it('should authenticate valid Bearer token', async () => {
      const mockPayload = { domain: 'test.com', exp: Math.floor(Date.now() / 1000) + 3600 };
      mockContext.req.header.mockReturnValue('Bearer valid-token');
      verify.mockResolvedValue(mockPayload);

      const result = await authService.authenticate(mockContext);

      expect(mockContext.req.header).toHaveBeenCalledWith('Authorization');
      expect(verify).toHaveBeenCalledWith('valid-token', mockJwtSecret);
      expect(result).toEqual(mockPayload);
    });

    it('should throw error for missing Authorization header', async () => {
      mockContext.req.header.mockReturnValue(undefined);

      await expect(authService.authenticate(mockContext)).rejects.toThrow(
        'Authentication failed: Authorization header missing or invalid'
      );
    });

    it('should throw error for invalid Authorization header format', async () => {
      mockContext.req.header.mockReturnValue('Invalid header');

      await expect(authService.authenticate(mockContext)).rejects.toThrow(
        'Authentication failed: Authorization header missing or invalid'
      );
    });

    it('should throw error for expired token', async () => {
      const mockPayload = {
        domain: 'test.com',
        exp: Math.floor(Date.now() / 1000) - 3600 // expired
      };
      mockContext.req.header.mockReturnValue('Bearer expired-token');
      verify.mockResolvedValue(mockPayload);

      await expect(authService.authenticate(mockContext)).rejects.toThrow(
        'Authentication failed: Invalid token: Token expired'
      );
    });
  });

  describe('getDomainInfo', () => {
    it('should return standard tier info for regular domains', () => {
      const result = authService.getDomainInfo('example.com');

      expect(result).toEqual({
        tier: 'standard',
        maxRequestsPerDay: 1000,
        features: ['chat', 'quiz']
      });
    });

    it('should return premium tier info for premium domains', () => {
      const result = authService.getDomainInfo('premium.example.com');

      expect(result).toEqual({
        tier: 'premium',
        maxRequestsPerDay: 10000,
        features: ['chat', 'quiz']
      });
    });

    it('should handle domain with premium keyword anywhere', () => {
      const result = authService.getDomainInfo('example-premium-test.com');

      expect(result.tier).toBe('premium');
      expect(result.maxRequestsPerDay).toBe(10000);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete auth flow', async () => {
      const domain = 'test.com';

      // Generate hash for domain
      const hash = await authService.generateDomainHash(domain);

      // Verify domain with hash
      const isValid = await authService.verifyDomain(domain, hash);
      expect(isValid).toBe(true);

      // Generate JWT
      const mockToken = 'generated-token';
      sign.mockResolvedValue(mockToken);
      const token = await authService.generateJWT(domain);
      expect(token).toBe(mockToken);

      // Verify JWT
      const mockPayload = {
        domain,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600
      };
      verify.mockResolvedValue(mockPayload);
      const payload = await authService.verifyJWT(token);
      expect(payload).toEqual(mockPayload);
    });
  });
});