import { Hono } from 'hono';
import { KVService } from '../services/kv.js';
import { createErrorResponse, createSuccessResponse } from '../utils/responses.js';

const quiz = new Hono();

// Get quiz questions based on content ID
quiz.get('/:contentId', async (c) => {
  try {
    const { contentId } = c.req.param();

    if (!contentId) {
      return c.json(createErrorResponse('Content ID is required', 400), 400);
    }

    // Initialize KV service
    const kvService = new KVService(c.env.AITUTOR_KV);

    // Get quiz from KV
    const quizData = await kvService.get(KVService.contentKey('quiz', contentId));

    if (!quizData) {
      return c.json(createErrorResponse('Quiz not found for this content', 404), 404);
    }

    return c.json(createSuccessResponse({
      contentId,
      quiz: quizData.quiz,
      totalQuestions: quizData.totalQuestions,
      language: quizData.language,
      createdAt: quizData.createdAt
    }));

  } catch (error) {
    console.error('Error getting quiz questions:', error);
    return c.json(createErrorResponse('Failed to get quiz questions', 500), 500);
  }
});

export default quiz;
