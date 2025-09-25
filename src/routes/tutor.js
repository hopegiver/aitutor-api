import { Hono } from 'hono';
import { OpenAIService } from '../services/openai.js';
import { parseSSEStream, createSSEResponse, createErrorResponse } from '../utils/responses.js';
import { validateTutorRequest, validateOptions, sanitizeInput } from '../utils/validation.js';

const tutor = new Hono();

tutor.post('/', async (c) => {
  try {
    const { question, context, options = {} } = await c.req.json();

    if (!question || typeof question !== 'string') {
      return c.json(createErrorResponse('Question is required'), 400);
    }

    validateTutorRequest(question, context);
    validateOptions(options);

    // Sanitize inputs
    const sanitizedQuestion = sanitizeInput(question);
    const sanitizedContext = context ? sanitizeInput(context) : undefined;

    // Check API key
    if (!c.env.OPENAI_API_KEY) {
      return c.json(createErrorResponse('OpenAI API key not configured'), 500);
    }

    // Process with OpenAI
    const openai = new OpenAIService(c.env.OPENAI_API_KEY);
    const stream = await openai.createTutorResponse(sanitizedQuestion, sanitizedContext, options);
    const parsedStream = parseSSEStream(stream);

    return createSSEResponse(parsedStream);

  } catch (error) {
    console.error('Tutor error:', error);
    return c.json(createErrorResponse(error.message), 400);
  }
});

tutor.post('/explain', async (c) => {
  try {
    const { topic, level = 'intermediate', options = {} } = await c.req.json();

    if (!topic || typeof topic !== 'string') {
      return c.json(createErrorResponse('Topic is required'), 400);
    }

    const systemPrompt = `You are an educational AI tutor. Provide a clear explanation at ${level} level.`;
    const question = `Explain ${sanitizeInput(topic)} in detail.`;

    validateOptions(options);

    // Check API key
    if (!c.env.OPENAI_API_KEY) {
      return c.json(createErrorResponse('OpenAI API key not configured'), 500);
    }

    // Process with OpenAI
    const openai = new OpenAIService(c.env.OPENAI_API_KEY);
    const stream = await openai.createTutorResponse(question, systemPrompt, options);
    const parsedStream = parseSSEStream(stream);

    return createSSEResponse(parsedStream);

  } catch (error) {
    console.error('Explain error:', error);
    return c.json(createErrorResponse(error.message), 400);
  }
});

tutor.post('/quiz', async (c) => {
  try {
    const { topic, questionCount = 5, options = {} } = await c.req.json();

    if (!topic || typeof topic !== 'string') {
      return c.json(createErrorResponse('Topic is required'), 400);
    }

    const question = `Create ${questionCount} quiz questions about ${sanitizeInput(topic)} with multiple choice answers.`;
    const context = 'Format as JSON with questions, options, and correct answers.';

    validateOptions(options);

    // Check API key
    if (!c.env.OPENAI_API_KEY) {
      return c.json(createErrorResponse('OpenAI API key not configured'), 500);
    }

    // Process with OpenAI
    const openai = new OpenAIService(c.env.OPENAI_API_KEY);
    const stream = await openai.createTutorResponse(question, context, options);
    const parsedStream = parseSSEStream(stream);

    return createSSEResponse(parsedStream);

  } catch (error) {
    console.error('Quiz error:', error);
    return c.json(createErrorResponse(error.message), 400);
  }
});

export default tutor;