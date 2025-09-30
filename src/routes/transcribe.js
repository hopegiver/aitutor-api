import { Hono } from 'hono';
import { z } from 'zod';
import { validateInput } from '../utils/validation.js';
import { createErrorResponse, createSuccessResponse } from '../utils/responses.js';

const transcribe = new Hono();

const uploadUrlSchema = z.object({
  videoUrl: z.string().url('Valid video URL is required'),
  language: z.string().optional().default('ko-KR'),
  options: z.object({
    format: z.enum(['srt', 'vtt', 'json']).optional().default('srt'),
    timestamps: z.boolean().optional().default(true),
    wordTimestamps: z.boolean().optional().default(false)
  }).optional().default({})
});

transcribe.post('/upload-url', async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = validateInput(uploadUrlSchema, body);

    if (!validatedData.success) {
      return createErrorResponse(c, 'Validation failed', validatedData.errors, 400);
    }

    const { videoUrl, language, options } = validatedData.data;

    const jobId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const jobData = {
      id: jobId,
      videoUrl,
      language,
      options: {
        format: 'srt',
        timestamps: true,
        wordTimestamps: false,
        ...options
      },
      status: 'queued',
      createdAt: timestamp,
      updatedAt: timestamp,
      progress: {
        stage: 'queued',
        percentage: 0,
        message: 'Job queued for processing'
      }
    };

    await c.env.TRANSCRIBE_KV.put(`job:${jobId}`, JSON.stringify(jobData));

    await c.env.TRANSCRIBE_QUEUE.send({
      jobId,
      action: 'process_video'
    });

    return createSuccessResponse(c, {
      jobId,
      status: 'queued',
      statusUrl: `/v1/transcribe/status/${jobId}`,
      resultUrl: `/v1/transcribe/result/${jobId}`
    });

  } catch (error) {
    console.error('Error creating transcribe job:', error);
    return createErrorResponse(c, 'Failed to create transcribe job', null, 500);
  }
});

transcribe.get('/status/:jobId', async (c) => {
  try {
    const { jobId } = c.req.param();

    if (!jobId) {
      return createErrorResponse(c, 'Job ID is required', null, 400);
    }

    const jobDataStr = await c.env.TRANSCRIBE_KV.get(`job:${jobId}`);

    if (!jobDataStr) {
      return createErrorResponse(c, 'Job not found', null, 404);
    }

    const jobData = JSON.parse(jobDataStr);

    return createSuccessResponse(c, {
      jobId: jobData.id,
      status: jobData.status,
      progress: jobData.progress,
      createdAt: jobData.createdAt,
      updatedAt: jobData.updatedAt,
      ...(jobData.status === 'failed' && { error: jobData.error })
    });

  } catch (error) {
    console.error('Error getting job status:', error);
    return createErrorResponse(c, 'Failed to get job status', null, 500);
  }
});

transcribe.get('/result/:jobId', async (c) => {
  try {
    const { jobId } = c.req.param();

    if (!jobId) {
      return createErrorResponse(c, 'Job ID is required', null, 400);
    }

    const jobDataStr = await c.env.TRANSCRIBE_KV.get(`job:${jobId}`);

    if (!jobDataStr) {
      return createErrorResponse(c, 'Job not found', null, 404);
    }

    const jobData = JSON.parse(jobDataStr);

    if (jobData.status !== 'completed') {
      return createErrorResponse(c, `Job is not completed. Current status: ${jobData.status}`, null, 400);
    }

    if (!jobData.result) {
      return createErrorResponse(c, 'Transcription result not available', null, 404);
    }

    return createSuccessResponse(c, {
      jobId: jobData.id,
      status: jobData.status,
      result: jobData.result,
      metadata: {
        language: jobData.language,
        options: jobData.options,
        duration: jobData.metadata?.duration,
        wordCount: jobData.metadata?.wordCount,
        completedAt: jobData.completedAt
      }
    });

  } catch (error) {
    console.error('Error getting transcribe result:', error);
    return createErrorResponse(c, 'Failed to get transcribe result', null, 500);
  }
});

export default transcribe;