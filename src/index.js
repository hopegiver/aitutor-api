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
  return c.json({
    status: 'ok',
    version: 'v1',
    timestamp: new Date().toISOString()
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
