import { Hono } from 'hono';
import { AuthService } from '../utils/auth.js';
import { createErrorResponse } from '../utils/responses.js';
import { sanitizeInput } from '../utils/validation.js';

const auth = new Hono();

auth.post('/', async (c) => {
  try {
    const { domain, authKey } = await c.req.json();

    // 입력 검증
    if (!domain || typeof domain !== 'string') {
      return c.json(createErrorResponse('Domain is required and must be a string'), 400);
    }

    if (!authKey || typeof authKey !== 'string') {
      return c.json(createErrorResponse('Auth key is required and must be a string'), 400);
    }

    // 환경 변수 확인
    if (!c.env.AUTH_SECRET_KEY) {
      return c.json(createErrorResponse('Authentication service not configured'), 500);
    }

    if (!c.env.JWT_SECRET) {
      return c.json(createErrorResponse('JWT service not configured'), 500);
    }

    // 입력값 정제
    const sanitizedDomain = sanitizeInput(domain).toLowerCase().trim();
    const sanitizedAuthKey = sanitizeInput(authKey).toLowerCase().trim();

    // 도메인 형식 간단 검증
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/;
    if (!domainRegex.test(sanitizedDomain)) {
      return c.json(createErrorResponse('Invalid domain format'), 400);
    }

    // 인증 서비스 초기화
    const authService = new AuthService(c.env.AUTH_SECRET_KEY, c.env.JWT_SECRET);

    // 도메인 해시 검증
    const isValidDomain = await authService.verifyDomain(sanitizedDomain, sanitizedAuthKey);

    if (!isValidDomain) {
      return c.json(createErrorResponse('Domain verification failed'), 401);
    }

    // 도메인별 추가 정보 가져오기
    const domainInfo = authService.getDomainInfo(sanitizedDomain);

    // JWT 토큰 생성
    const token = await authService.generateJWT(sanitizedDomain, domainInfo);

    // 성공 응답
    return c.json({
      success: true,
      message: 'Domain verified successfully',
      token,
      domain: sanitizedDomain,
      expiresIn: '24h',
      domainInfo,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Auth verification error:', error);
    return c.json(createErrorResponse('Authentication service error: ' + error.message), 500);
  }
});

// 인증키 발행 엔드포인트
auth.post('/generate', async (c) => {
  try {
    const { domain, password } = await c.req.json();

    // 입력 검증
    if (!domain || typeof domain !== 'string') {
      return c.json(createErrorResponse('Domain is required and must be a string'), 400);
    }

    if (!password || typeof password !== 'string') {
      return c.json(createErrorResponse('Password is required and must be a string'), 400);
    }

    // 환경 변수 확인
    if (!c.env.AUTH_SECRET_KEY) {
      return c.json(createErrorResponse('Authentication service not configured'), 500);
    }

    // 입력값 정제
    const sanitizedDomain = sanitizeInput(domain).toLowerCase().trim();
    const sanitizedPassword = sanitizeInput(password).trim();

    // 도메인 형식 검증
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/;
    if (!domainRegex.test(sanitizedDomain)) {
      return c.json(createErrorResponse('Invalid domain format'), 400);
    }

    // 비밀번호 SHA256 해시 계산
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(sanitizedPassword);
    const passwordHashBuffer = await crypto.subtle.digest('SHA-256', passwordData);
    const passwordHashArray = Array.from(new Uint8Array(passwordHashBuffer));
    const passwordHash = passwordHashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // 비밀번호 검증
    const validPasswordHash = 'fb682c5d455938b2d9974a7c0159e43664e94265b953f21f9e3d35f9d99047a6';
    if (passwordHash !== validPasswordHash) {
      return c.json(createErrorResponse('Invalid password'), 401);
    }

    // 인증키 생성
    const authService = new AuthService(c.env.AUTH_SECRET_KEY, c.env.JWT_SECRET);
    const authKey = await authService.generateDomainHash(sanitizedDomain);

    // 성공 응답
    return c.json({
      success: true,
      message: 'Auth key generated successfully',
      domain: sanitizedDomain,
      authKey,
      timestamp: new Date().toISOString(),
      usage: {
        description: 'Use this authKey with the domain to authenticate via POST /v1/auth',
        example: {
          domain: sanitizedDomain,
          authKey: authKey
        }
      }
    });

  } catch (error) {
    console.error('Auth key generation error:', error);
    return c.json(createErrorResponse('Auth key generation service error: ' + error.message), 500);
  }
});

export default auth;