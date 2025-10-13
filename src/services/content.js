import { VectorizeService } from './vectorize.js';
import { KVService } from './kv.js';

/**
 * Content Service
 * Handles content-related operations including upload, processing, retrieval, and search
 */
export class ContentService {
  constructor(env, openaiService) {
    this.env = env;
    this.openaiService = openaiService;
    this.vectorizeService = new VectorizeService(env.CONTENT_VECTORIZE, openaiService);
    this.kvService = new KVService(env.AITUTOR_KV);
  }

  /**
   * Create content upload job
   */
  async createUploadJob(videoUrl, language = 'ko-KR', force = false, options = {}) {
    // URL을 해시 처리하여 contentId 생성
    const urlHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(videoUrl));
    const contentId = Array.from(new Uint8Array(urlHash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 32);

    const timestamp = new Date().toISOString();

    // 기존 작업 확인
    const existingJob = await this.kvService.get(KVService.contentKey('info', contentId));

    if (existingJob && !force) {
      return {
        contentId,
        status: existingJob.status,
        statusUrl: `/v1/content/status/${contentId}`,
        resultUrl: `/v1/content/result/${contentId}`,
        isExisting: true,
        message: 'Found existing transcription job. Use force=true to reprocess.'
      };
    }

    // 작업 데이터 생성
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
      createdAt: existingJob?.createdAt || timestamp,
      updatedAt: timestamp,
      progress: {
        stage: 'queued',
        percentage: 0,
        message: force ? 'Job requeued for reprocessing' : 'Job queued for processing'
      }
    };

    await this.kvService.set(KVService.contentKey('info', contentId), contentData);

    // Queue the job
    await this.env.TRANSCRIBE_QUEUE.send({
      contentId,
      action: 'process_video'
    });

    return {
      contentId,
      status: 'queued',
      statusUrl: `/v1/content/status/${contentId}`,
      resultUrl: `/v1/content/result/${contentId}`,
      isExisting: !!existingJob,
      message: force ? 'Video requeued for reprocessing' : 'Video queued for processing'
    };
  }

  /**
   * Get content status
   */
  async getContentStatus(contentId) {
    const contentData = await this.kvService.get(KVService.contentKey('info', contentId));

    if (!contentData) {
      throw new Error('Content not found');
    }

    return {
      contentId: contentData.contentId,
      status: contentData.status,
      progress: contentData.progress,
      createdAt: contentData.createdAt,
      updatedAt: contentData.updatedAt,
      ...(contentData.status === 'failed' && { error: contentData.error })
    };
  }

  /**
   * Get content result
   */
  async getContentResult(contentId) {
    // Get content info (metadata)
    const infoData = await this.kvService.get(KVService.contentKey('info', contentId));
    if (!infoData) {
      throw new Error('Content not found');
    }

    if (infoData.status !== 'completed') {
      throw new Error(`Content is not completed. Current status: ${infoData.status}`);
    }

    // Get subtitle data (transcription result)
    const subtitleData = await this.kvService.get(KVService.contentKey('subtitle', contentId));
    if (!subtitleData) {
      throw new Error('Subtitle data not available');
    }

    return {
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
    };
  }

  /**
   * Get content summary
   */
  async getContentSummary(contentId) {
    const summaryData = await this.kvService.get(KVService.contentKey('summary', contentId));

    if (!summaryData) {
      throw new Error('Content summary not found');
    }

    return {
      contentId,
      originalText: summaryData.originalText,
      summary: summaryData.summary,
      objectives: summaryData.objectives || [],
      recommendedQuestions: summaryData.recommendedQuestions || [],
      language: summaryData.language,
      duration: summaryData.duration,
      videoUrl: summaryData.videoUrl,
      createdAt: summaryData.createdAt
    };
  }

  /**
   * Get content subtitle
   */
  async getContentSubtitle(contentId) {
    const subtitleData = await this.kvService.get(KVService.contentKey('subtitle', contentId));

    if (!subtitleData) {
      throw new Error('Content subtitle not found');
    }

    return {
      contentId,
      segments: subtitleData.segments,
      language: subtitleData.language,
      duration: subtitleData.duration,
      format: subtitleData.format,
      content: subtitleData.content,
      source: subtitleData.source,
      videoUrl: subtitleData.videoUrl,
      createdAt: subtitleData.createdAt
    };
  }

  /**
   * Search content using vectorized search
   */
  async searchContent(query, options = {}) {
    const { topK = 10, contentId, type, language } = options;

    const searchResults = await this.vectorizeService.searchContent(query, {
      topK,
      contentId,
      type,
      language
    });

    return {
      query,
      results: searchResults.results,
      total: searchResults.total,
      options,
      debug: searchResults.debug
    };
  }

  /**
   * Get content context for AI chat
   */
  async getContentContext(query, maxChunks = 5) {
    const contextResult = await this.vectorizeService.getContentContext(query, maxChunks);
    return contextResult;
  }

  /**
   * Re-index existing content in vectorize
   */
  async reindexContent(contentId) {
    // Get content summary and subtitle data
    const summaryData = await this.kvService.get(KVService.contentKey('summary', contentId));
    const subtitleData = await this.kvService.get(KVService.contentKey('subtitle', contentId));

    if (!summaryData || !subtitleData) {
      throw new Error('Content data not found');
    }

    // Re-index content in vectorize
    const vectorMetadata = {
      language: subtitleData.language,
      duration: subtitleData.duration,
      videoUrl: summaryData.videoUrl,
      source: subtitleData.source
    };

    const indexResult = await this.vectorizeService.indexContent(
      contentId,
      summaryData.summary,
      subtitleData.segments,
      vectorMetadata
    );

    return {
      contentId,
      message: 'Content re-indexed successfully',
      indexResult
    };
  }

  /**
   * Generate new summary with learning objectives and recommended questions
   */
  async generateNewSummary(contentId) {
    // Get original content data
    const existingSummaryData = await this.kvService.get(KVService.contentKey('summary', contentId));

    if (!existingSummaryData) {
      throw new Error('Content not found');
    }

    if (!existingSummaryData.originalText) {
      throw new Error('Original text not available for summary generation');
    }

    // Generate new comprehensive summary with objectives and recommended questions
    const newEducationalContent = await this.generateSummaryOnly(
      existingSummaryData.originalText,
      existingSummaryData.language || 'ko'
    );

    // Update the summary data with new content
    const updatedSummaryData = {
      ...existingSummaryData,
      summary: newEducationalContent.summary,
      objectives: newEducationalContent.objectives,
      recommendedQuestions: newEducationalContent.recommendedQuestions,
      createdAt: new Date().toISOString(),
      type: 'regenerated'
    };

    // Store updated summary
    await this.kvService.set(KVService.contentKey('summary', contentId), updatedSummaryData);

    return {
      contentId,
      summary: newEducationalContent.summary,
      objectives: newEducationalContent.objectives,
      recommendedQuestions: newEducationalContent.recommendedQuestions,
      language: existingSummaryData.language,
      videoUrl: existingSummaryData.videoUrl,
      createdAt: updatedSummaryData.createdAt,
      type: 'regenerated'
    };
  }

  /**
   * Generate comprehensive educational content (summary, objectives, questions, quiz)
   */
  async generateEducationalContent(text, language) {
    const messages = [
      {
        role: 'system',
        content: `You are an educational content creator. Generate comprehensive educational content from video transcription content including summary, learning objectives, recommended questions, and quiz.

Response Format (MUST follow exactly):
{
  "summary": "your detailed summary here",
  "objectives": [
    "learning objective 1",
    "learning objective 2",
    "learning objective 3"
  ],
  "recommendedQuestions": [
    "recommended question 1",
    "recommended question 2",
    "recommended question 3",
    "recommended question 4",
    "recommended question 5"
  ],
  "quiz": [
    {"question": "question 1", "options": ["A", "B", "C", "D"], "answer": 0, "explanation": "explanation"},
    {"question": "question 2", "options": ["A", "B", "C", "D"], "answer": 1, "explanation": "explanation"},
    {"question": "question 3", "options": ["A", "B", "C", "D"], "answer": 2, "explanation": "explanation"},
    {"question": "question 4", "options": ["A", "B", "C", "D"], "answer": 3, "explanation": "explanation"},
    {"question": "question 5", "options": ["A", "B", "C", "D"], "answer": 0, "explanation": "explanation"}
  ]
}

Summary Guidelines:
- Create a clear, organized summary that captures key concepts and learning points
- IMPORTANT: Keep the summary under 400 words
- Start your summary with: ${language === 'ko' ? '"### 강의 내용 요약\\n\\n이 문서는 강의 영상의 핵심 내용을 요약한 교육 자료입니다."' : '"### Lecture Content Summary\\n\\nThis document summarizes the key content from the lecture video."'}
- Include relevant keywords naturally throughout the summary
- Respond in ${language === 'ko' ? 'Korean' : 'English'} language

Learning Objectives Guidelines:
- Generate exactly 3 clear, specific learning objectives
- Each objective should describe what learners will be able to do/understand
- Use action verbs like ${language === 'ko' ? '"이해할 수 있다", "설명할 수 있다", "구분할 수 있다", "적용할 수 있다"' : '"understand", "explain", "identify", "apply"'}
- ${language === 'ko' ? 'Start each objective with "이 강의를 통해" or similar phrase' : 'Start each objective with "After this lecture, students will be able to"'}
- Focus on the most important concepts and skills from the content

Recommended Questions Guidelines:
- Generate 5 thoughtful questions that learners might ask about this content
- Questions should encourage deeper thinking and engagement
- Include both clarification questions and application questions
- Make questions practical and relevant to learning
- Questions should be naturally curious and educational

Quiz Guidelines:
- Generate exactly 5 high-quality multiple choice questions
- Each question should test understanding of key concepts from the content
- Provide 4 answer options (A, B, C, D) for each question
- Include the correct answer index (0-3) and a brief explanation
- Questions should be practical and educational
- Avoid overly simple or overly complex questions
- Focus on the most important concepts in the content`
      },
      {
        role: 'user',
        content: `Please create comprehensive educational content from the following video transcription:
- Summary (400 words max)
- 3 Learning objectives
- 5 Recommended questions for learners
- 5 Quiz questions with multiple choice answers

Content:
${text}`
      }
    ];

    try {
      const response = await this.openaiService.createChatCompletion({
        messages,
        model: 'gpt-4o-mini',
        max_tokens: 2000,
        temperature: 0.3
      });

      const responseText = response.choices[0].message.content.trim();

      // Remove markdown code blocks if present
      const cleanedResponse = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');

      try {
        const parsedContent = JSON.parse(cleanedResponse);
        return {
          summary: parsedContent.summary || 'Summary generation failed',
          objectives: Array.isArray(parsedContent.objectives) ? parsedContent.objectives : [],
          recommendedQuestions: Array.isArray(parsedContent.recommendedQuestions) ? parsedContent.recommendedQuestions : [],
          quiz: Array.isArray(parsedContent.quiz) ? parsedContent.quiz : []
        };
      } catch (parseError) {
        console.error('Error parsing educational content response:', parseError);
        return {
          summary: 'Educational content generation failed - please try again',
          objectives: [],
          recommendedQuestions: [],
          quiz: []
        };
      }
    } catch (error) {
      console.error('Error generating educational content:', error);
      return {
        summary: 'Educational content generation failed due to API error',
        objectives: [],
        recommendedQuestions: [],
        quiz: []
      };
    }
  }

  /**
   * Generate only summary with learning objectives and recommended questions (no quiz)
   */
  async generateSummaryOnly(text, language) {
    const messages = [
      {
        role: 'system',
        content: `You are an educational content creator. Generate a comprehensive summary with learning objectives and recommended questions from video transcription content.

Response Format (MUST follow exactly):
{
  "summary": "your detailed summary here",
  "objectives": [
    "learning objective 1",
    "learning objective 2",
    "learning objective 3"
  ],
  "recommendedQuestions": [
    "recommended question 1",
    "recommended question 2",
    "recommended question 3",
    "recommended question 4",
    "recommended question 5"
  ]
}

Summary Guidelines:
- Create a clear, organized summary that captures key concepts and learning points
- IMPORTANT: Keep the summary under 400 words
- Start your summary with: ${language === 'ko' ? '"### 강의 내용 요약\\n\\n이 문서는 강의 영상의 핵심 내용을 요약한 교육 자료입니다."' : '"### Lecture Content Summary\\n\\nThis document summarizes the key content from the lecture video."'}
- Include relevant keywords naturally throughout the summary (e.g., "강의", "학습", "교육", "내용 요약" for Korean content)
- Respond in ${language === 'ko' ? 'Korean' : 'English'} language

Learning Objectives Guidelines:
- Generate exactly 3 clear, specific learning objectives
- Each objective should describe what learners will be able to do/understand
- Use action verbs like ${language === 'ko' ? '"이해할 수 있다", "설명할 수 있다", "구분할 수 있다", "적용할 수 있다"' : '"understand", "explain", "identify", "apply"'}
- ${language === 'ko' ? 'Start each objective with "이 강의를 통해" or similar phrase' : 'Start each objective with "After this lecture, students will be able to"'}
- Focus on the most important concepts and skills from the content

Recommended Questions Guidelines:
- Generate 5 thoughtful questions that learners might ask about this content
- Questions should encourage deeper thinking and engagement
- Include both clarification questions and application questions
- Make questions practical and relevant to learning
- Questions should be naturally curious and educational`
      },
      {
        role: 'user',
        content: `Please create a comprehensive educational package from the following video transcription content:
- Summary (400 words max)
- 3 Learning objectives
- 5 Recommended questions for learners

Content:
${text}`
      }
    ];

    try {
      const response = await this.openaiService.createChatCompletion({
        messages,
        model: 'gpt-4o-mini',
        max_tokens: 1200,
        temperature: 0.3
      });

      const responseText = response.choices[0].message.content.trim();

      // Remove markdown code blocks if present
      const cleanedResponse = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '');

      try {
        const parsedContent = JSON.parse(cleanedResponse);
        return {
          summary: parsedContent.summary || 'Summary generation failed',
          objectives: Array.isArray(parsedContent.objectives) ? parsedContent.objectives : [],
          recommendedQuestions: Array.isArray(parsedContent.recommendedQuestions) ? parsedContent.recommendedQuestions : []
        };
      } catch (parseError) {
        console.error('Error parsing comprehensive summary response:', parseError);

        // Fallback: try to extract from text
        const lines = responseText.split('\n').filter(line => line.trim());

        return {
          summary: 'Summary generation failed - please try again',
          objectives: [],
          recommendedQuestions: []
        };
      }
    } catch (error) {
      console.error('Error generating comprehensive summary:', error);
      return {
        summary: 'Summary generation failed due to API error',
        objectives: [],
        recommendedQuestions: []
      };
    }
  }
}