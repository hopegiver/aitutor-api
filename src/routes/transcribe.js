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
      return c.json(createErrorResponse('Validation failed', 400), 400);
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

    await c.env.AITUTOR_KV.put(`transcribe:job:${jobId}`, JSON.stringify(jobData));

    await c.env.TRANSCRIBE_QUEUE.send({
      jobId,
      action: 'process_video'
    });

    return c.json(createSuccessResponse({
      jobId,
      status: 'queued',
      statusUrl: `/v1/transcribe/status/${jobId}`,
      resultUrl: `/v1/transcribe/result/${jobId}`
    }));

  } catch (error) {
    console.error('Error creating transcribe job:', error);
    return c.json(createErrorResponse('Failed to create transcribe job', 500), 500);
  }
});

transcribe.get('/status/:jobId', async (c) => {
  try {
    const { jobId } = c.req.param();

    if (!jobId) {
      return c.json(createErrorResponse('Job ID is required', 400), 400);
    }

    const jobDataStr = await c.env.AITUTOR_KV.get(`transcribe:job:${jobId}`);

    if (!jobDataStr) {
      return c.json(createErrorResponse('Job not found', 404), 404);
    }

    const jobData = JSON.parse(jobDataStr);

    return c.json(createSuccessResponse({
      jobId: jobData.id,
      status: jobData.status,
      progress: jobData.progress,
      createdAt: jobData.createdAt,
      updatedAt: jobData.updatedAt,
      ...(jobData.status === 'failed' && { error: jobData.error })
    }));

  } catch (error) {
    console.error('Error getting job status:', error);
    return c.json(createErrorResponse('Failed to get job status', 500), 500);
  }
});

transcribe.get('/result/:jobId', async (c) => {
  try {
    const { jobId } = c.req.param();

    if (!jobId) {
      return c.json(createErrorResponse('Job ID is required', 400), 400);
    }

    const jobDataStr = await c.env.AITUTOR_KV.get(`transcribe:job:${jobId}`);

    if (!jobDataStr) {
      return c.json(createErrorResponse('Job not found', 404), 404);
    }

    const jobData = JSON.parse(jobDataStr);

    if (jobData.status !== 'completed') {
      return c.json(createErrorResponse(`Job is not completed. Current status: ${jobData.status}`, 400), 400);
    }

    if (!jobData.result) {
      return c.json(createErrorResponse('Transcription result not available', 404), 404);
    }

    return c.json(createSuccessResponse({
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
    }));

  } catch (error) {
    console.error('Error getting transcribe result:', error);
    return c.json(createErrorResponse('Failed to get transcribe result', 500), 500);
  }
});

export default transcribe;