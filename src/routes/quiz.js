import { Hono } from 'hono';
import { OpenAIService } from '../services/openai.js';
import { parseSSEStream, createSSEResponse, createErrorResponse } from '../utils/responses.js';
import { validateOptions, sanitizeInput } from '../utils/validation.js';

const quiz = new Hono();

quiz.post('/', async (c) => {
  try {
    const { topic, questionCount = 5, options = {} } = await c.req.json();

    if (!topic || typeof topic !== 'string') {
      return c.json(createErrorResponse('Topic is required and must be a string'), 400);
    }

    // Validate question count
    const count = parseInt(questionCount);
    if (isNaN(count) || count < 1 || count > 10) {
      return c.json(createErrorResponse('Question count must be between 1 and 10'), 400);
    }

    validateOptions(options);

    // Sanitize inputs
    const sanitizedTopic = sanitizeInput(topic);

    // Check API key
    if (!c.env.OPENAI_API_KEY) {
      return c.json(createErrorResponse('OpenAI API key not configured'), 500);
    }

    // Process with OpenAI (AI Gateway ID 'aitutor' 하드코딩됨)
    const openai = new OpenAIService(c.env);
    const stream = await openai.createQuiz(sanitizedTopic, count, options);
    const parsedStream = parseSSEStream(stream);

    return createSSEResponse(parsedStream);

  } catch (error) {
    console.error('Quiz error:', error);
    return c.json(createErrorResponse(error.message), 400);
  }
});

quiz.post('/generate', async (c) => {
  try {
    const { topic, difficulty = 'intermediate', type = 'multiple-choice', questionCount = 5, options = {} } = await c.req.json();

    if (!topic || typeof topic !== 'string') {
      return c.json(createErrorResponse('Topic is required and must be a string'), 400);
    }

    const count = parseInt(questionCount);
    if (isNaN(count) || count < 1 || count > 10) {
      return c.json(createErrorResponse('Question count must be between 1 and 10'), 400);
    }

    validateOptions(options);

    const sanitizedTopic = sanitizeInput(topic);

    if (!c.env.OPENAI_API_KEY) {
      return c.json(createErrorResponse('OpenAI API key not configured'), 500);
    }

    // Enhanced quiz generation with difficulty and type
    const systemMessage = {
      role: 'system',
      content: `You are an expert quiz generator. Create ${difficulty} level ${type} questions about the given topic.
                Format your response as JSON:
                {
                  "title": "Quiz: [Topic Name] (${difficulty})",
                  "difficulty": "${difficulty}",
                  "type": "${type}",
                  "questions": [
                    {
                      "question": "Question text",
                      "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
                      "correct": "A",
                      "explanation": "Detailed explanation"
                    }
                  ]
                }
                IMPORTANT: Complete quiz within 450 tokens. Generate exactly ${count} questions.`
    };

    const userMessage = {
      role: 'user',
      content: `Create ${count} ${difficulty} level ${type} questions about: ${sanitizedTopic}`
    };

    // Process with OpenAI (AI Gateway ID 'aitutor' 하드코딩됨)
    const openai = new OpenAIService(c.env);
    const stream = await openai.streamChat([systemMessage, userMessage], options);
    const parsedStream = parseSSEStream(stream);

    return createSSEResponse(parsedStream);

  } catch (error) {
    console.error('Quiz generate error:', error);
    return c.json(createErrorResponse(error.message), 400);
  }
});

export default quiz;