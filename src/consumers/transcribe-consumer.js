import { KVService } from '../services/kv.js';
import { StreamService } from '../services/stream.js';
import { OpenAIService } from '../services/openai.js';
import { VectorizeService } from '../services/vectorize.js';
import { ContentService } from '../services/content.js';

export class TranscribeConsumer {
  constructor(env) {
    this.env = env;
    this.streamService = new StreamService(env.CLOUDFLARE_ACCOUNT_ID, env.STREAM_API_TOKEN);

    this.openaiService = new OpenAIService(env.OPENAI_API_KEY, env.CLOUDFLARE_ACCOUNT_ID);

    this.contentService = new ContentService(env, this.openaiService);
  }

  async handleMessage(message) {
    const { contentId, action, streamId, language } = message;

    try {
      console.log(`Processing content ${contentId} with action ${action}`);

      switch (action) {
        case 'process_video':
          await this.processVideo(contentId);
          break;
        case 'recaption':
          await this.recaptionVideo(contentId, streamId, language);
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }

    } catch (error) {
      console.error(`Error processing content ${contentId}:`, error);
      await this.contentService.setError(contentId, error);
    }
  }

  async processVideo(contentId) {
    const contentData = await this.contentService.kvService.get(KVService.contentKey('info', contentId));
    if (!contentData) {
      throw new Error(`Content ${contentId} not found`);
    }

    console.log(`Processing video for contentId: ${contentId}`);

    await this.contentService.updateStatus(contentId, 'processing');
    await this.contentService.updateProgress(contentId, 'uploading', 10, 'Uploading video to Cloudflare Stream');

    try {
      const streamResult = await this.streamService.uploadVideoFromUrl(contentData.videoUrl, {
        name: `Content ${contentId}`,
        contentId: contentId
      });

      const streamUid = streamResult.uid;

      await this.contentService.updateProgress(contentId, 'processing', 30, 'Video uploaded, waiting for processing');

      const processedVideo = await this.streamService.waitForProcessing(streamUid);

      await this.contentService.updateProgress(contentId, 'generating-captions', 50, 'Generating AI captions with Cloudflare Stream');

      await this.generateStreamCaptions(contentId, streamUid);

    } catch (error) {
      console.error(`Error processing video for content ${contentId}:`, error);
      throw error;
    }
  }

  async recaptionVideo(contentId, streamId, language) {
    console.log(`Recaptioning video for contentId: ${contentId}, streamId: ${streamId}, language: ${language}`);

    await this.contentService.updateStatus(contentId, 'processing');
    await this.contentService.updateProgress(contentId, 'recaptioning', 10, 'Starting recaptioning process');

    try {
      // Use existing streamId, no need to upload again
      await this.generateStreamCaptions(contentId, streamId, language);
    } catch (error) {
      console.error(`Error recaptioning video for content ${contentId}:`, error);
      throw error;
    }
  }

  async generateStreamCaptions(contentId, streamUid, languageOverride = null) {
    const contentData = await this.contentService.kvService.get(KVService.contentKey('info', contentId));
    if (!contentData) {
      throw new Error(`Content ${contentId} not found`);
    }

    let captionsGenerated = false;
    let captionsReady = false;

    try {
      // Use languageOverride if provided, otherwise use content's original language
      const targetLanguage = languageOverride || contentData.language;
      const streamLanguage = this.streamService.mapLanguageCode(targetLanguage);

      await this.contentService.updateProgress(contentId, 'generating-captions', 60, `Starting AI caption generation in ${streamLanguage}`);

      const captionResult = await this.streamService.generateCaptions(streamUid, streamLanguage);
      console.log(`Caption generation started for ${streamUid}:`, captionResult);
      captionsGenerated = true;

      const progressCallback = async (stage, percentage, message) => {
        await this.contentService.updateProgress(contentId, stage, percentage, message);
      };

      const captionStatus = await this.streamService.waitForCaptions(streamUid, streamLanguage, 600000, 10000, progressCallback);
      console.log(`Captions ready for ${streamUid}:`, captionStatus);
      captionsReady = true;

      await this.contentService.updateProgress(contentId, 'downloading-captions', 85, 'Downloading generated captions');

      const captionContent = await this.streamService.getCaptionContent(streamUid, streamLanguage);

      await this.contentService.updateProgress(contentId, 'summarizing', 90, 'Generating AI content summary');

      const plainText = this.streamService.extractPlainText(captionContent.content);
      const educationalContent = await this.contentService.generateSummary(plainText, captionContent.language);

      const summary = educationalContent.summary;
      const objectives = educationalContent.objectives || [];
      const recommendedQuestions = educationalContent.recommendedQuestions || [];
      const quiz = educationalContent.quiz || [];

      const duration = this.streamService.extractDurationFromVTT(captionContent.content);
      const segments = this.streamService.convertVTTToSegments(captionContent.content);

      await this.contentService.setInfo(contentId, {
        contentId,
        status: 'completed',
        language: captionContent.language,
        duration,
        videoUrl: contentData.videoUrl,
        streamId: streamUid,
        source: 'cloudflare-stream-ai',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      await this.contentService.setSubtitle(contentId, {
        contentId,
        segments,
        language: captionContent.language,
        duration,
        source: 'cloudflare-stream-ai',
        videoUrl: contentData.videoUrl,
        createdAt: new Date().toISOString()
      });

      await this.contentService.setSummaryData(contentId, {
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

      if (quiz && quiz.length > 0) {
        await this.contentService.kvService.set(KVService.contentKey('quiz', contentId), {
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

      console.log(`✅ Generated ${objectives?.length || 0} learning objectives for content ${contentId}`);
      console.log(`✅ Generated ${recommendedQuestions?.length || 0} recommended questions for content ${contentId}`);

      await this.contentService.updateProgress(contentId, 'indexing', 95, 'Indexing content for search');

      try {
        const vectorMetadata = {
          language: captionContent.language,
          duration,
          videoUrl: contentData.videoUrl,
          source: 'cloudflare-stream-ai'
        };

        const indexResult = await this.contentService.vectorizeService.indexContent(
          contentId,
          summary,
          segments,
          vectorMetadata
        );

        console.log(`✅ Vectorize indexing completed:`, indexResult);
      } catch (vectorError) {
        console.error(`❌ Failed to index content in Vectorize:`, vectorError);
      }

      console.log(`Content ${contentId} completed successfully with Stream AI captions`);
      console.log(`✅ Stream video preserved with ID: ${streamUid}`);
      await this.contentService.updateProgress(contentId, 'completed', 100, 'Content processing completed');

    } catch (error) {
      console.error(`Error generating Stream captions for content ${contentId}:`, error);
      console.error(`Caption generation status - Generated: ${captionsGenerated}, Ready: ${captionsReady}`);
      throw error;
    }
  }

}

export default async function handleQueue(batch, env) {
  const consumer = new TranscribeConsumer(env);

  // 병렬 처리: 모든 메시지를 동시에 처리
  const results = await Promise.allSettled(
    batch.messages.map(async (message) => {
      try {
        await consumer.handleMessage(message.body);
        message.ack();
        return { success: true, messageId: message.id };
      } catch (error) {
        console.error(`Failed to process queue message ${message.id}:`, error);
        message.retry();
        return { success: false, messageId: message.id, error };
      }
    })
  );

  // 처리 결과 로깅
  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;
  console.log(`✅ Batch processing completed: ${successful} successful, ${failed} failed out of ${batch.messages.length} messages`);
}