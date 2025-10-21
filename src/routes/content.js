import { Hono } from 'hono';
import { z } from 'zod';
import { validateInput } from '../utils/validation.js';
import { createErrorResponse, createSuccessResponse } from '../utils/responses.js';
import { ContentService } from '../services/content.js';
import { OpenAIService } from '../services/openai.js';

const content = new Hono();

const uploadUrlSchema = z.object({
  videoUrl: z.string().url('Valid video URL is required'),
  language: z.string().optional().default('ko-KR'),
  force: z.boolean().optional().default(false), // 강제 재처리 옵션
  options: z.object({
    format: z.enum(['srt', 'vtt', 'json']).optional().default('vtt'),
    timestamps: z.boolean().optional().default(true),
    wordTimestamps: z.boolean().optional().default(false)
  }).optional().default({})
});

const searchSchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  topK: z.number().min(1).max(50).optional().default(10),
  contentId: z.string().optional(), // Filter by specific content
  type: z.enum(['transcript', 'summary']).optional(), // Filter by content type
  language: z.string().optional() // Filter by language
});

// Helper function to initialize services
function initializeServices(env) {
  const openaiService = new OpenAIService(env.OPENAI_API_KEY, env.CLOUDFLARE_ACCOUNT_ID);
  const contentService = new ContentService(env, openaiService);
  return { openaiService, contentService };
}

content.post('/upload-url', async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = validateInput(uploadUrlSchema, body);

    if (!validatedData.success) {
      return c.json(createErrorResponse('Validation failed', 400), 400);
    }

    const { videoUrl, language, force, options } = validatedData.data;
    const { contentService } = initializeServices(c.env);

    const result = await contentService.createUploadJob(videoUrl, language, force, options);
    return c.json(createSuccessResponse(result));

  } catch (error) {
    console.error('Error creating transcribe job:', error);
    return c.json(createErrorResponse('Failed to create transcribe job', 500), 500);
  }
});

content.get('/status/:contentId', async (c) => {
  try {
    const { contentId } = c.req.param();

    if (!contentId) {
      return c.json(createErrorResponse('Content ID is required', 400), 400);
    }

    const { contentService } = initializeServices(c.env);
    const result = await contentService.getContentStatus(contentId);
    return c.json(createSuccessResponse(result));

  } catch (error) {
    console.error('Error getting job status:', error);
    if (error.message === 'Content not found') {
      return c.json(createErrorResponse('Content not found', 404), 404);
    }
    return c.json(createErrorResponse('Failed to get job status', 500), 500);
  }
});

content.get('/result/:contentId', async (c) => {
  try {
    const { contentId } = c.req.param();

    if (!contentId) {
      return c.json(createErrorResponse('Content ID is required', 400), 400);
    }

    const { contentService } = initializeServices(c.env);
    const result = await contentService.getContentResult(contentId);
    return c.json(createSuccessResponse(result));

  } catch (error) {
    console.error('Error getting transcribe result:', error);
    if (error.message === 'Content not found') {
      return c.json(createErrorResponse('Content not found', 404), 404);
    }
    if (error.message.includes('not completed')) {
      return c.json(createErrorResponse(error.message, 400), 400);
    }
    if (error.message === 'Subtitle data not available') {
      return c.json(createErrorResponse('Subtitle data not available', 404), 404);
    }
    return c.json(createErrorResponse('Failed to get transcribe result', 500), 500);
  }
});

// Get content summary for chatbot integration
content.get('/summary/:contentId', async (c) => {
  try {
    const { contentId } = c.req.param();

    if (!contentId) {
      return c.json(createErrorResponse('Content ID is required', 400), 400);
    }

    const { contentService } = initializeServices(c.env);
    const result = await contentService.getContentSummary(contentId);
    return c.json(createSuccessResponse(result));

  } catch (error) {
    console.error('Error getting content summary:', error);
    if (error.message === 'Content summary not found') {
      return c.json(createErrorResponse('Content summary not found', 404), 404);
    }
    return c.json(createErrorResponse('Failed to get content summary', 500), 500);
  }
});

// Get content subtitle (original transcription)
content.get('/subtitle/:contentId', async (c) => {
  try {
    const { contentId } = c.req.param();

    if (!contentId) {
      return c.json(createErrorResponse('Content ID is required', 400), 400);
    }

    const { contentService } = initializeServices(c.env);
    const result = await contentService.getContentSubtitle(contentId);
    return c.json(createSuccessResponse(result));

  } catch (error) {
    console.error('Error getting content subtitle:', error);
    if (error.message === 'Content subtitle not found') {
      return c.json(createErrorResponse('Content subtitle not found', 404), 404);
    }
    return c.json(createErrorResponse('Failed to get content subtitle', 500), 500);
  }
});

// Search content using vectorized search (POST only to support Korean characters)
content.post('/search', async (c) => {
  try {
    const { query, topK = 10, contentId, type, language } = await c.req.json();

    const validatedData = validateInput(searchSchema, {
      query,
      topK,
      contentId,
      type,
      language
    });

    if (!validatedData.success) {
      return c.json(createErrorResponse('Validation failed', 400), 400);
    }

    const { query: searchQuery, ...searchOptions } = validatedData.data;
    const { contentService } = initializeServices(c.env);

    const result = await contentService.searchContent(searchQuery, searchOptions);
    return c.json(createSuccessResponse(result));

  } catch (error) {
    console.error('Error searching content:', error);
    return c.json(createErrorResponse('Failed to search content', 500), 500);
  }
});

// Get content context for AI chat (used internally by chat routes)
content.post('/context', async (c) => {
  try {
    const body = await c.req.json();
    const { query, maxChunks = 5 } = body;

    if (!query || typeof query !== 'string') {
      return c.json(createErrorResponse('Query is required', 400), 400);
    }

    const { contentService } = initializeServices(c.env);
    const result = await contentService.getContentContext(query, maxChunks);
    return c.json(createSuccessResponse(result));

  } catch (error) {
    console.error('Error getting content context:', error);
    return c.json(createErrorResponse('Failed to get content context', 500), 500);
  }
});

// Re-index existing content in vectorize (admin function)
content.post('/reindex/:contentId', async (c) => {
  try {
    const { contentId } = c.req.param();

    if (!contentId) {
      return c.json(createErrorResponse('Content ID is required', 400), 400);
    }

    const { contentService } = initializeServices(c.env);
    const result = await contentService.reindexContent(contentId);
    return c.json(createSuccessResponse(result));

  } catch (error) {
    console.error('Error re-indexing content:', error);
    if (error.message === 'Content data not found') {
      return c.json(createErrorResponse('Content data not found', 404), 404);
    }
    return c.json(createErrorResponse('Failed to re-index content', 500), 500);
  }
});

// Regenerate captions for existing content (requires streamId)
content.post('/recaption/:contentId', async (c) => {
  try {
    const { contentId } = c.req.param();
    const body = await c.req.json();
    const { language } = body;

    if (!contentId) {
      return c.json(createErrorResponse('Content ID is required', 400), 400);
    }

    const { contentService } = initializeServices(c.env);

    // Get content info to retrieve streamId
    const contentInfo = await contentService.kvService.get(`content:info:${contentId}`);

    if (!contentInfo) {
      return c.json(createErrorResponse('Content not found', 404), 404);
    }

    if (!contentInfo.streamId) {
      return c.json(createErrorResponse('Stream ID not found. Cannot regenerate captions for this content.', 400), 400);
    }

    // Queue recaptioning job
    await c.env.TRANSCRIBE_QUEUE.send({
      contentId,
      action: 'recaption',
      streamId: contentInfo.streamId,
      language: language || contentInfo.language
    });

    return c.json(createSuccessResponse({
      contentId,
      streamId: contentInfo.streamId,
      status: 'queued',
      message: 'Recaptioning job queued successfully',
      language: language || contentInfo.language
    }));

  } catch (error) {
    console.error('Error queueing recaption job:', error);
    return c.json(createErrorResponse('Failed to queue recaption job', 500), 500);
  }
});

// Generate new summary with learning objectives, recommended questions, and quiz
content.post('/generate-summary/:contentId', async (c) => {
  try {
    const { contentId } = c.req.param();

    if (!contentId) {
      return c.json(createErrorResponse('Content ID is required', 400), 400);
    }

    const { contentService } = initializeServices(c.env);

    // Get existing summary data
    const existingSummary = await contentService.getContentSummary(contentId);

    if (!existingSummary.originalText) {
      return c.json(createErrorResponse('Original text not available for summary generation', 400), 400);
    }

    // Generate new comprehensive summary
    const newEducationalContent = await contentService.generateSummary(
      existingSummary.originalText,
      existingSummary.language || 'ko'
    );

    // Update the summary
    const updatedSummary = await contentService.updateContentSummary(contentId, {
      summary: newEducationalContent.summary,
      objectives: newEducationalContent.objectives,
      recommendedQuestions: newEducationalContent.recommendedQuestions,
      quiz: newEducationalContent.quiz,
      type: 'regenerated'
    });

    return c.json(createSuccessResponse({
      contentId,
      summary: updatedSummary.summary,
      objectives: updatedSummary.objectives,
      recommendedQuestions: updatedSummary.recommendedQuestions,
      quiz: updatedSummary.quiz,
      language: updatedSummary.language,
      videoUrl: updatedSummary.videoUrl,
      createdAt: updatedSummary.createdAt,
      updatedAt: updatedSummary.updatedAt,
      type: updatedSummary.type
    }));

  } catch (error) {
    console.error('Error generating new summary:', error);
    if (error.message === 'Content summary not found') {
      return c.json(createErrorResponse('Content not found', 404), 404);
    }
    return c.json(createErrorResponse('Failed to generate new summary', 500), 500);
  }
});

export default content;