import { KVService } from './kv.js';
import { QueueService } from './queue.js';
import { StreamService } from './stream.js';
import { OpenAIService } from './openai.js';
import { VectorizeService } from './vectorize.js';
import { ContentService } from './content.js';

export class TranscribeConsumer {
  constructor(env) {
    this.kvService = new KVService(env.AITUTOR_KV);
    this.queueService = new QueueService(env.TRANSCRIBE_QUEUE);
    this.streamService = new StreamService(env.CLOUDFLARE_ACCOUNT_ID, env.STREAM_API_TOKEN);

    this.openaiService = new OpenAIService(env);

    this.vectorizeService = new VectorizeService(
      env.CONTENT_VECTORIZE,
      this.openaiService
    );
  }

  async handleMessage(message) {
    const { contentId, action } = message;

    try {
      console.log(`Processing content ${contentId} with action ${action}`);

      switch (action) {
        case 'process_video':
          await this.processVideo(contentId);
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }

    } catch (error) {
      console.error(`Error processing content ${contentId}:`, error);
      await this.kvService.setContentError(contentId, error);
    }
  }

  async processVideo(contentId) {
    const contentData = await this.kvService.getContent(contentId);
    if (!contentData) {
      throw new Error(`Content ${contentId} not found`);
    }

    // Use contentId for all operations
    console.log(`Processing video for contentId: ${contentId}`);

    await this.kvService.updateContentStatus(contentId, 'processing');
    await this.kvService.updateContentProgress(contentId, 'uploading', 10, 'Uploading video to Cloudflare Stream');

    try {
      const streamResult = await this.streamService.uploadVideoFromUrl(contentData.videoUrl, {
        name: `Content ${contentId}`,
        contentId: contentId
      });

      // Store Stream UID separately for progress tracking
      const streamUid = streamResult.uid;

      await this.kvService.updateContentProgress(contentId, 'processing', 30, 'Video uploaded, waiting for processing');

      const processedVideo = await this.streamService.waitForProcessing(streamUid);

      await this.kvService.updateContentProgress(contentId, 'generating-captions', 50, 'Generating AI captions with Cloudflare Stream');

      // Use Stream AI Caption Generation instead of Whisper
      await this.generateStreamCaptions(contentId, streamUid);

    } catch (error) {
      console.error(`Error processing video for content ${contentId}:`, error);
      throw error;
    }
  }

  async generateStreamCaptions(contentId, streamUid) {
    const contentData = await this.kvService.getContent(contentId);
    if (!contentData) {
      throw new Error(`Content ${contentId} not found`);
    }

    let captionsGenerated = false;
    let captionsReady = false;

    try {
      // Map language code for Stream API
      const streamLanguage = this.streamService.mapLanguageCode(contentData.language);

      await this.kvService.updateContentProgress(contentId, 'generating-captions', 60, `Starting AI caption generation in ${streamLanguage}`);

      // Start caption generation
      const captionResult = await this.streamService.generateCaptions(streamUid, streamLanguage);
      console.log(`Caption generation started for ${streamUid}:`, captionResult);
      captionsGenerated = true;

      // Wait for captions to be ready with progress updates
      const progressCallback = async (stage, percentage, message) => {
        await this.kvService.updateContentProgress(contentId, stage, percentage, message);
      };

      const captionStatus = await this.streamService.waitForCaptions(streamUid, streamLanguage, 600000, 10000, progressCallback);
      console.log(`Captions ready for ${streamUid}:`, captionStatus);
      captionsReady = true;

      await this.kvService.updateContentProgress(contentId, 'downloading-captions', 85, 'Downloading generated captions');

      // Get caption content
      const captionContent = await this.streamService.getCaptionContent(streamUid, streamLanguage);

      await this.kvService.updateContentProgress(contentId, 'summarizing', 90, 'Generating AI content summary');

      // Generate comprehensive educational content using ContentService
      const plainText = this.streamService.extractPlainText(captionContent.content);
      const contentService = new ContentService(this.env, new OpenAIService(this.env));
      const educationalContent = await contentService.generateEducationalContent(plainText, captionContent.language);

      // Extract generated content
      const summary = educationalContent.summary;
      const objectives = educationalContent.objectives || [];
      const recommendedQuestions = educationalContent.recommendedQuestions || [];
      const quiz = educationalContent.quiz || [];

      // Extract common data once
      const duration = this.streamService.extractDurationFromVTT(captionContent.content);
      const segments = this.streamService.convertVTTToSegments(captionContent.content);

      // Store content info (metadata only)
      await this.kvService.setContentInfo(contentId, {
        contentId,
        status: 'completed',
        language: captionContent.language,
        duration,
        videoUrl: contentData.videoUrl,
        source: 'cloudflare-stream-ai',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Store subtitle segments only (for timestamp-based search)
      await this.kvService.setContentSubtitle(contentId, {
        contentId,
        segments,
        language: captionContent.language,
        duration,
        source: 'cloudflare-stream-ai',
        videoUrl: contentData.videoUrl,
        createdAt: new Date().toISOString()
      });

      // Store original text + AI summary + educational content (for text-based search/conversation)
      await this.kvService.setContentSummary(contentId, {
        contentId,
        originalText: plainText,
        summary: summary,
        objectives: objectives,
        recommendedQuestions: recommendedQuestions,
        language: captionContent.language,
        duration,
        videoUrl: contentData.videoUrl,
        createdAt: new Date().toISOString()
      });

      // Store quiz questions if generated
      if (quiz && quiz.length > 0) {
        await this.kvService.set(KVService.contentKey('quiz', contentId), {
          contentId,
          quiz: quiz,
          language: captionContent.language,
          totalQuestions: quiz.length,
          videoUrl: contentData.videoUrl,
          createdAt: new Date().toISOString(),
          type: 'pre-generated'
        });
        console.log(`✅ Generated ${quiz.length} quiz questions for content ${contentId}`);
      }

      // Learning objectives and recommended questions are now stored together with summary
      console.log(`✅ Generated ${objectives?.length || 0} learning objectives for content ${contentId}`);
      console.log(`✅ Generated ${recommendedQuestions?.length || 0} recommended questions for content ${contentId}`);

      // Index content in Vectorize for search
      await this.kvService.updateContentProgress(contentId, 'indexing', 95, 'Indexing content for search');

      try {
        const vectorMetadata = {
          language: captionContent.language,
          duration,
          videoUrl: contentData.videoUrl,
          source: 'cloudflare-stream-ai'
        };

        const indexResult = await this.vectorizeService.indexContent(
          contentId,
          summary,
          segments,
          vectorMetadata
        );

        console.log(`✅ Vectorize indexing completed:`, indexResult);
      } catch (vectorError) {
        console.error(`❌ Failed to index content in Vectorize:`, vectorError);
        // Don't fail the entire process if vectorization fails
      }

      console.log(`Content ${contentId} completed successfully with Stream AI captions`);
      await this.kvService.updateContentProgress(contentId, 'completed', 100, 'Content processing completed');

    } catch (error) {
      console.error(`Error generating Stream captions for content ${contentId}:`, error);

      // Log detailed error information for debugging
      console.error(`Caption generation status - Generated: ${captionsGenerated}, Ready: ${captionsReady}`);

      throw error;

    } finally {
      // Always attempt to clean up the video, regardless of success or failure
      try {
        console.log(`Cleaning up video ${streamUid} from Stream...`);
        await this.streamService.deleteVideo(streamUid);
        console.log(`✅ Successfully cleaned up video ${streamUid} from Stream`);
      } catch (cleanupError) {
        console.error(`❌ Failed to delete video ${streamUid} from Stream:`, cleanupError);
        // Don't throw here - we want the original error to be preserved if there was one
      }
    }
  }

  // Removed: generateContentSummary, generateSingleSummary, generateChunkedSummary,
  // generateLearningObjectives, generateRecommendedQuestions
  // These functions are now handled by ContentService.generateEducationalContent

  // Removed: splitTextIntoChunks
  // Text chunking is no longer used - ContentService now processes full text


  // Removed: mapLanguageCodeForStream - now handled by StreamService.mapLanguageCode

  // Removed: extractPlainText, extractDurationFromVTT, convertVTTToSegments
  // These methods are now handled by StreamService

  // Removed: convertCaptionFormat, convertVTTToSRT, secondsToSRTTime
  // These format conversion methods are not currently used


}

export default async function handleQueue(batch, env) {
  const consumer = new TranscribeConsumer(env);

  for (const message of batch.messages) {
    try {
      await consumer.handleMessage(message.body);
      message.ack();
    } catch (error) {
      console.error('Failed to process queue message:', error);
      message.retry();
    }
  }
}