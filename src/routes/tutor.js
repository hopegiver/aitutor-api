import { Hono } from 'hono';
import { OpenAIService } from '../services/openai.js';
import { parseSSEStream, createSSEResponse, createErrorResponse } from '../utils/responses.js';
import { validateOptions, sanitizeInput } from '../utils/validation.js';

const tutor = new Hono();

tutor.post('/explain', async (c) => {
  try {
    const { topic, level = 'intermediate', options = {} } = await c.req.json();

    if (!topic || typeof topic !== 'string') {
      return c.json(createErrorResponse('Topic is required'), 400);
    }

    validateOptions(options);

    // Build explanation message
    const messages = [
      {
        role: 'system',
        content: `You are an expert educator. Provide a clear, detailed explanation at ${level} level.
                  Use examples, analogies, and structured explanations.
                  IMPORTANT: Keep your complete explanation within 450 tokens.`
      },
      {
        role: 'user',
        content: `Please explain "${sanitizeInput(topic)}" at ${level} level with examples.`
      }
    ];

    // Check API key
    if (!c.env.OPENAI_API_KEY) {
      return c.json(createErrorResponse('OpenAI API key not configured'), 500);
    }

    // Process with OpenAI
    const openai = new OpenAIService(c.env.OPENAI_API_KEY);
    const stream = await openai.streamChat(messages, options);
    const parsedStream = parseSSEStream(stream);

    return createSSEResponse(parsedStream);

  } catch (error) {
    console.error('Explain error:', error);
    return c.json(createErrorResponse(error.message), 400);
  }
});

export default tutor;