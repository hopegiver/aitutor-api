import { KVService } from './kv.js';
import { QueueService } from './queue.js';
import { StreamService } from './stream.js';
import { OpenAIService } from './openai.js';

export class TranscribeConsumer {
  constructor(env) {
    this.kvService = new KVService(env.AITUTOR_KV);
    this.queueService = new QueueService(env.TRANSCRIBE_QUEUE);
    this.streamService = new StreamService(env.CLOUDFLARE_ACCOUNT_ID, env.STREAM_API_TOKEN);

    this.openaiService = new OpenAIService(
      env.OPENAI_API_KEY,
      env.CLOUDFLARE_ACCOUNT_ID
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
      const streamLanguage = this.mapLanguageCodeForStream(contentData.language);

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

      // Convert VTT to requested format if needed
      const finalContent = await this.convertCaptionFormat(captionContent.content, contentData.options.format || 'vtt');

      await this.kvService.updateContentProgress(contentId, 'summarizing', 90, 'Generating AI content summary');

      // Generate AI content summary
      const plainText = this.extractPlainText(captionContent.content);
      const summary = await this.generateContentSummary(plainText, captionContent.language);

      // Create transcription result compatible with existing format
      const transcriptionResult = {
        text: plainText,
        language: captionContent.language,
        duration: this.extractDurationFromVTT(captionContent.content),
        segments: this.convertVTTToSegments(captionContent.content),
        format: contentData.options.format || 'vtt',
        content: finalContent,
        source: 'cloudflare-stream-ai'
      };

      const metadata = {
        contentId: contentId,
        streamUid: streamUid,
        originalLanguage: captionContent.language,
        generatedBy: 'cloudflare-stream-ai',
        captionLabel: captionContent.label
      };

      // Store original transcription result in job
      await this.kvService.setContentResult(contentId, transcriptionResult, metadata);

      // Store content info (metadata only)
      await this.kvService.setContentInfo(contentId, {
        contentId,
        status: 'completed',
        language: captionContent.language,
        duration: this.extractDurationFromVTT(captionContent.content),
        videoUrl: contentData.videoUrl,
        source: 'cloudflare-stream-ai',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Store subtitle segments only (for timestamp-based search)
      await this.kvService.setContentSubtitle(contentId, {
        contentId,
        streamUid: streamUid,
        segments: this.convertVTTToSegments(captionContent.content),
        language: captionContent.language,
        duration: this.extractDurationFromVTT(captionContent.content),
        format: contentData.options.format || 'vtt',
        content: finalContent,
        source: 'cloudflare-stream-ai',
        videoUrl: contentData.videoUrl,
        createdAt: new Date().toISOString()
      });

      // Store original text + AI summary (for text-based search/conversation)
      await this.kvService.setContentSummary(contentId, {
        contentId,
        streamUid: streamUid,
        originalText: plainText,
        summary: summary,
        language: captionContent.language,
        duration: this.extractDurationFromVTT(captionContent.content),
        videoUrl: contentData.videoUrl,
        createdAt: new Date().toISOString()
      });

      console.log(`Content ${contentId} completed successfully with Stream AI captions`);

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

  async generateContentSummary(text, language) {
    try {
      const messages = [
        {
          role: 'system',
          content: `You are an educational content summarizer. Your task is to create a concise, well-structured summary of video transcription content for learning purposes.

Guidelines:
- Create a clear, organized summary that captures key concepts and learning points
- Use bullet points or numbered lists for better readability
- Focus on educational value and main takeaways
- Include important details, examples, or explanations mentioned in the content
- Keep the summary comprehensive but concise
- Respond in ${language === 'ko' ? 'Korean' : 'English'} language
- Structure your response with clear sections if the content covers multiple topics`
        },
        {
          role: 'user',
          content: `Please summarize the following video transcription content for educational purposes:

${text}`
        }
      ];

      const response = await this.openaiService.createChatCompletion({
        messages,
        model: 'gpt-4o-mini',
        max_tokens: 2000,
        temperature: 0.3
      });

      return response.choices[0].message.content;

    } catch (error) {
      console.error('Error generating content summary:', error);
      // Return a fallback summary if AI generation fails
      return `원본 자막 내용 요약:

${text.substring(0, 500)}${text.length > 500 ? '...' : ''}

※ AI 요약 생성 중 오류가 발생하여 원본 텍스트의 일부만 표시됩니다.`;
    }
  }


  mapLanguageCodeForStream(language) {
    // Map language codes to Stream AI supported languages
    const languageMap = {
      'ko-KR': 'ko',
      'ko': 'ko',
      'en-US': 'en',
      'en': 'en',
      'ja-JP': 'ja',
      'ja': 'ja',
      'zh-CN': 'zh',
      'zh': 'zh',
      'es-ES': 'es',
      'es': 'es',
      'fr-FR': 'fr',
      'fr': 'fr',
      'de-DE': 'de',
      'de': 'de',
      'it-IT': 'it',
      'it': 'it',
      'pt-PT': 'pt',
      'pt': 'pt',
      'ru-RU': 'ru',
      'ru': 'ru',
      'pl': 'pl',
      'cs': 'cs',
      'nl': 'nl'
    };

    return languageMap[language] || language.split('-')[0] || 'en';
  }

  extractPlainText(vttContent) {
    // Extract plain text from VTT format
    const lines = vttContent.split('\n');
    const textLines = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // Skip VTT headers, timestamps, and empty lines
      if (trimmed &&
          !trimmed.startsWith('WEBVTT') &&
          !trimmed.startsWith('NOTE') &&
          !trimmed.includes('-->') &&
          !trimmed.match(/^\d+$/)) {
        textLines.push(trimmed);
      }
    }

    return textLines.join(' ');
  }

  extractDurationFromVTT(vttContent) {
    // Extract total duration from VTT timestamps
    const timestamps = vttContent.match(/(\d{2}:\d{2}:\d{2}\.\d{3})/g);
    if (timestamps && timestamps.length > 0) {
      const lastTimestamp = timestamps[timestamps.length - 1];
      return this.timeStringToSeconds(lastTimestamp);
    }
    return 0;
  }

  timeStringToSeconds(timeString) {
    const [hours, minutes, seconds] = timeString.split(':');
    return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
  }

  convertVTTToSegments(vttContent) {
    // Convert VTT to segments array
    const lines = vttContent.split('\n');
    const segments = [];
    let currentSegment = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Check for timestamp line
      const timestampMatch = trimmed.match(/^(\d{2}:\d{2}:\d{2}\.\d{3}) --> (\d{2}:\d{2}:\d{2}\.\d{3})/);
      if (timestampMatch) {
        if (currentSegment) {
          segments.push(currentSegment);
        }
        currentSegment = {
          start: this.timeStringToSeconds(timestampMatch[1]),
          end: this.timeStringToSeconds(timestampMatch[2]),
          text: ''
        };
      } else if (currentSegment && trimmed && !trimmed.match(/^\d+$/)) {
        // Add text to current segment
        currentSegment.text = currentSegment.text ? `${currentSegment.text} ${trimmed}` : trimmed;
      }
    }

    if (currentSegment) {
      segments.push(currentSegment);
    }

    return segments;
  }

  async convertCaptionFormat(vttContent, targetFormat) {
    // Convert VTT to other formats if needed
    switch (targetFormat.toLowerCase()) {
      case 'vtt':
        return vttContent;
      case 'srt':
        return this.convertVTTToSRT(vttContent);
      case 'json':
        return JSON.stringify(this.convertVTTToSegments(vttContent), null, 2);
      default:
        return vttContent;
    }
  }

  convertVTTToSRT(vttContent) {
    const segments = this.convertVTTToSegments(vttContent);
    let srtContent = '';

    segments.forEach((segment, index) => {
      const startTime = this.secondsToSRTTime(segment.start);
      const endTime = this.secondsToSRTTime(segment.end);

      srtContent += `${index + 1}\n`;
      srtContent += `${startTime} --> ${endTime}\n`;
      srtContent += `${segment.text}\n\n`;
    });

    return srtContent.trim();
  }

  secondsToSRTTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  }


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