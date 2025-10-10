import { Hono } from 'hono';
import { cors } from 'hono/cors';
import chat from './routes/chat.js';
import quiz from './routes/quiz.js';
import docs from './routes/docs.js';
import auth from './routes/auth.js';
import content from './routes/content.js';
import { AuthService } from './utils/auth.js';
import { createErrorResponse } from './utils/responses.js';
import handleQueue from './services/transcribe-consumer.js';

const app = new Hono();

// CORS middleware - 매우 관대한 설정 (개발용)
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE', 'PATCH', 'HEAD'],
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With',
    'Access-Control-Allow-Origin',
    'Access-Control-Allow-Headers',
    'Access-Control-Allow-Methods',
    'Cache-Control',
    'Pragma'
  ],
  exposeHeaders: ['Content-Length', 'X-JSON', 'Access-Control-Allow-Origin'],
  credentials: false,
  maxAge: 86400 // 24 hours
}));

// 전역 인증 미들웨어 (특정 경로 제외)
app.use('*', async (c, next) => {
  const path = c.req.path;

  // 인증이 필요없는 경로들
  const publicPaths = [
    '/',
    '/health',
    '/docs',
    '/v1/auth',
    '/v1/auth/generate'
  ];

  // docs 경로 하위도 모두 허용
  const isPublicPath = publicPaths.some(publicPath =>
    path === publicPath || path.startsWith('/docs/')
  );

  if (isPublicPath) {
    await next();
    return;
  }

  // 인증이 필요한 경로에 대해 JWT 검증
  try {
    if (!c.env.AUTH_SECRET_KEY || !c.env.JWT_SECRET) {
      return c.json(createErrorResponse('Authentication service not configured'), 500);
    }

    const authService = new AuthService(c.env.AUTH_SECRET_KEY, c.env.JWT_SECRET);
    const user = await authService.authenticate(c);

    // 검증된 사용자 정보를 context에 저장
    c.set('user', user);

    await next();
  } catch (error) {
    return c.json(createErrorResponse(error.message, 401, 'AUTH_FAILED'), 401);
  }
});

// Root redirect to docs
app.get('/', (c) => {
  return c.redirect('/docs');
});

// Health check
app.get('/health', (c) => {
  const cf = c.req.cf || {};
  const headers = {};

  // Collect all CF headers
  c.req.raw.headers.forEach((value, key) => {
    if (key.toLowerCase().startsWith('cf-')) {
      headers[key] = value;
    }
  });

  return c.json({
    status: 'ok',
    version: 'v1',
    timestamp: new Date().toISOString(),
    region: {
      country: cf.country || 'unknown',
      region: cf.region || 'unknown',
      city: cf.city || 'unknown',
      datacenter: cf.colo || 'unknown',
      timezone: cf.timezone || 'unknown',
      latitude: cf.latitude || 'unknown',
      longitude: cf.longitude || 'unknown'
    },
    cfHeaders: headers,
    environment: c.env?.ENVIRONMENT || 'unknown',
    allCfData: cf
  });
});

// Documentation
app.route('/docs', docs);

// API Routes
app.route('/v1/auth', auth);
app.route('/v1/chat', chat);
app.route('/v1/quiz', quiz);
app.route('/v1/content', content);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({ error: 'Internal Server Error' }, 500);
});


export default {
  fetch: app.fetch,
  queue: handleQueue
};
