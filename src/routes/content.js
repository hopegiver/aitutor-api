import { Hono } from 'hono';
import { z } from 'zod';
import { validateInput } from '../utils/validation.js';
import { createErrorResponse, createSuccessResponse } from '../utils/responses.js';

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

content.post('/upload-url', async (c) => {
  try {
    const body = await c.req.json();
    const validatedData = validateInput(uploadUrlSchema, body);

    if (!validatedData.success) {
      return c.json(createErrorResponse('Validation failed', 400), 400);
    }

    const { videoUrl, language, force, options } = validatedData.data;

    // URL을 해시 처리하여 contentId 생성 (콘텐츠 식별용)
    const urlHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(videoUrl));
    const contentId = Array.from(new Uint8Array(urlHash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 32); // 32자리로 제한

    const timestamp = new Date().toISOString();

    // 기존 작업 확인
    const existingJobKey = `content:info:${contentId}`;
    const existingJobStr = await c.env.AITUTOR_KV.get(existingJobKey);

    if (existingJobStr && !force) {
      // 기존 작업이 있고 강제 재처리가 아닌 경우
      const existingJob = JSON.parse(existingJobStr);

      return c.json(createSuccessResponse({
        contentId,
        status: existingJob.status,
        statusUrl: `/v1/content/status/${contentId}`,
        resultUrl: `/v1/content/result/${contentId}`,
        isExisting: true,
        message: 'Found existing transcription job. Use force=true to reprocess.'
      }));
    }

    // 작업 데이터 생성 (기존 작업이 있으면 생성일시 보존)
    const existingContent = existingJobStr ? JSON.parse(existingJobStr) : null;

    const contentData = {
      contentId,
      videoUrl,
      language,
      options: {
        format: 'vtt',
        timestamps: true,
        wordTimestamps: false,
        ...options
      },
      status: 'queued',
      createdAt: existingContent?.createdAt || timestamp, // 기존 생성일시 보존
      updatedAt: timestamp,
      progress: {
        stage: 'queued',
        percentage: 0,
        message: force ? 'Job requeued for reprocessing' : 'Job queued for processing'
      }
    };

    await c.env.AITUTOR_KV.put(`content:info:${contentId}`, JSON.stringify(contentData));

    await c.env.TRANSCRIBE_QUEUE.send({
      contentId,
      action: 'process_video'
    });

    return c.json(createSuccessResponse({
      contentId,
      status: 'queued',
      statusUrl: `/v1/content/status/${contentId}`,
      resultUrl: `/v1/content/result/${contentId}`,
      isExisting: !!existingContent,
      message: force ? 'Video requeued for reprocessing' : 'Video queued for processing'
    }));

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

    const contentDataStr = await c.env.AITUTOR_KV.get(`content:info:${contentId}`);

    if (!contentDataStr) {
      return c.json(createErrorResponse('Content not found', 404), 404);
    }

    const contentData = JSON.parse(contentDataStr);

    return c.json(createSuccessResponse({
      contentId: contentData.contentId,
      status: contentData.status,
      progress: contentData.progress,
      createdAt: contentData.createdAt,
      updatedAt: contentData.updatedAt,
      ...(contentData.status === 'failed' && { error: contentData.error })
    }));

  } catch (error) {
    console.error('Error getting job status:', error);
    return c.json(createErrorResponse('Failed to get job status', 500), 500);
  }
});

content.get('/result/:contentId', async (c) => {
  try {
    const { contentId } = c.req.param();

    if (!contentId) {
      return c.json(createErrorResponse('Content ID is required', 400), 400);
    }

    // Get content info (metadata)
    const infoDataStr = await c.env.AITUTOR_KV.get(`content:info:${contentId}`);
    if (!infoDataStr) {
      return c.json(createErrorResponse('Content not found', 404), 404);
    }
    const infoData = JSON.parse(infoDataStr);

    if (infoData.status !== 'completed') {
      return c.json(createErrorResponse(`Content is not completed. Current status: ${infoData.status}`, 400), 400);
    }

    // Get subtitle data (transcription result)
    const subtitleDataStr = await c.env.AITUTOR_KV.get(`content:subtitle:${contentId}`);
    if (!subtitleDataStr) {
      return c.json(createErrorResponse('Subtitle data not available', 404), 404);
    }
    const subtitleData = JSON.parse(subtitleDataStr);

    return c.json(createSuccessResponse({
      contentId,
      status: infoData.status,
      result: {
        text: subtitleData.text,
        language: subtitleData.language,
        duration: subtitleData.duration,
        segments: subtitleData.segments,
        format: subtitleData.format,
        content: subtitleData.content,
        source: subtitleData.source
      },
      metadata: {
        language: infoData.language,
        duration: infoData.duration,
        videoUrl: infoData.videoUrl,
        source: infoData.source,
        createdAt: infoData.createdAt,
        updatedAt: infoData.updatedAt
      }
    }));

  } catch (error) {
    console.error('Error getting transcribe result:', error);
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

    const summaryDataStr = await c.env.AITUTOR_KV.get(`content:summary:${contentId}`);

    if (!summaryDataStr) {
      return c.json(createErrorResponse('Content summary not found', 404), 404);
    }

    const summaryData = JSON.parse(summaryDataStr);

    return c.json(createSuccessResponse({
      contentId,
      originalText: summaryData.originalText,
      summary: summaryData.summary,
      language: summaryData.language,
      duration: summaryData.duration,
      videoUrl: summaryData.videoUrl,
      createdAt: summaryData.createdAt
    }));

  } catch (error) {
    console.error('Error getting content summary:', error);
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

    const subtitleDataStr = await c.env.AITUTOR_KV.get(`content:subtitle:${contentId}`);

    if (!subtitleDataStr) {
      return c.json(createErrorResponse('Content subtitle not found', 404), 404);
    }

    const subtitleData = JSON.parse(subtitleDataStr);

    return c.json(createSuccessResponse({
      contentId,
      segments: subtitleData.segments,
      language: subtitleData.language,
      duration: subtitleData.duration,
      format: subtitleData.format,
      content: subtitleData.content,
      source: subtitleData.source,
      videoUrl: subtitleData.videoUrl,
      createdAt: subtitleData.createdAt
    }));

  } catch (error) {
    console.error('Error getting content subtitle:', error);
    return c.json(createErrorResponse('Failed to get content subtitle', 500), 500);
  }
});

// List available content infos
content.get('/contents', async (c) => {
  try {
    const { keys } = await c.env.AITUTOR_KV.list({ prefix: 'content:info:', limit: 100 });
    const contents = [];

    for (const key of keys) {
      const contentId = key.name.replace('content:info:', '');
      const infoDataStr = await c.env.AITUTOR_KV.get(key.name);

      if (infoDataStr) {
        const infoData = JSON.parse(infoDataStr);

        // Get summary preview if available
        const summaryDataStr = await c.env.AITUTOR_KV.get(`content:summary:${contentId}`);
        let summaryPreview = null;
        if (summaryDataStr) {
          const summaryData = JSON.parse(summaryDataStr);
          summaryPreview = summaryData.summary ? summaryData.summary.substring(0, 200) + (summaryData.summary.length > 200 ? '...' : '') : null;
        }

        contents.push({
          contentId,
          status: infoData.status,
          language: infoData.language,
          duration: infoData.duration,
          videoUrl: infoData.videoUrl,
          source: infoData.source,
          createdAt: infoData.createdAt,
          updatedAt: infoData.updatedAt,
          summaryPreview
        });
      }
    }

    return c.json(createSuccessResponse({
      contents,
      total: contents.length
    }));

  } catch (error) {
    console.error('Error listing content infos:', error);
    return c.json(createErrorResponse('Failed to list contents', 500), 500);
  }
});

export default content;