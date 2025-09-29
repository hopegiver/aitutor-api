import { Hono } from 'hono';
import { cors } from 'hono/cors';
import chat from './routes/chat.js';
import quiz from './routes/quiz.js';
import docs from './routes/docs.js';

const app = new Hono();

// CORS middleware
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

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
app.route('/v1/chat', chat);
app.route('/v1/quiz', quiz);

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not Found' }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({ error: 'Internal Server Error' }, 500);
});

export default app;
