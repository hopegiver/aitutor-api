import { Hono } from 'hono';
import { OpenAIService } from '../services/openai.js';
import { parseSSEStream, createSSEResponse, createErrorResponse } from '../utils/responses.js';
import { validateChatMessages, validateOptions, sanitizeInput } from '../utils/validation.js';

const chat = new Hono();

chat.post('/', async (c) => {
  try {
    const { messages, options = {} } = await c.req.json();

    // Basic validation
    if (!messages || !Array.isArray(messages)) {
      return c.json(createErrorResponse('Messages array is required'), 400);
    }

    validateChatMessages(messages);
    validateOptions(options);

    // Sanitize messages
    const sanitizedMessages = messages.map(msg => ({
      ...msg,
      content: sanitizeInput(msg.content)
    }));

    // Check API key
    if (!c.env.OPENAI_API_KEY) {
      return c.json(createErrorResponse('OpenAI API key not configured'), 500);
    }

    // Azure OpenAI 설정 (fallback)
    const azureConfig = {
      apiKey: c.env.AZURE_OPENAI_API_KEY,
      endpoint: c.env.AZURE_OPENAI_ENDPOINT,
      apiVersion: c.env.AZURE_OPENAI_API_VERSION
    };

    // Process with OpenAI (AI Gateway ID 'aitutor' 하드코딩됨)
    const openai = new OpenAIService(c.env.OPENAI_API_KEY, c.env.CLOUDFLARE_ACCOUNT_ID, azureConfig);
    const stream = await openai.streamChat(sanitizedMessages, options);
    const parsedStream = parseSSEStream(stream);

    return createSSEResponse(parsedStream);

  } catch (error) {
    console.error('Chat error:', error);
    return c.json(createErrorResponse(error.message), 400);
  }
});

chat.post('/simple', async (c) => {
  try {
    const { message, systemPrompt, options = {} } = await c.req.json();

    if (!message || typeof message !== 'string') {
      return c.json(createErrorResponse('Message is required'), 400);
    }

    // Build messages array
    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: message });

    validateOptions(options);

    // Check API key
    if (!c.env.OPENAI_API_KEY) {
      return c.json(createErrorResponse('OpenAI API key not configured'), 500);
    }

    // Azure OpenAI 설정 (fallback)
    const azureConfig = {
      apiKey: c.env.AZURE_OPENAI_API_KEY,
      endpoint: c.env.AZURE_OPENAI_ENDPOINT,
      apiVersion: c.env.AZURE_OPENAI_API_VERSION
    };

    // Process with OpenAI (AI Gateway ID 'aitutor' 하드코딩됨)
    const openai = new OpenAIService(c.env.OPENAI_API_KEY, c.env.CLOUDFLARE_ACCOUNT_ID, azureConfig);
    const stream = await openai.streamChat(messages, options);
    const parsedStream = parseSSEStream(stream);

    return createSSEResponse(parsedStream);

  } catch (error) {
    console.error('Simple chat error:', error);
    return c.json(createErrorResponse(error.message), 400);
  }
});

export default chat;