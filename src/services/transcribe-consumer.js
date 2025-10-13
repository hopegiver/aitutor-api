import { KVService } from './kv.js';
import { QueueService } from './queue.js';
import { StreamService } from './stream.js';
import { OpenAIService } from './openai.js';
import { VectorizeService } from './vectorize.js';

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

      await this.kvService.updateContentProgress(contentId, 'summarizing', 90, 'Generating AI content summary');

      // Generate AI content summary
      const plainText = this.extractPlainText(captionContent.content);
      const summary = await this.generateContentSummary(plainText, captionContent.language);

      // Extract common data once
      const duration = this.extractDurationFromVTT(captionContent.content);
      const segments = this.convertVTTToSegments(captionContent.content);

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

      // Store original text + AI summary (for text-based search/conversation)
      await this.kvService.setContentSummary(contentId, {
        contentId,
        originalText: plainText,
        summary: summary,
        language: captionContent.language,
        duration,
        videoUrl: contentData.videoUrl,
        createdAt: new Date().toISOString()
      });

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

  async generateContentSummary(text, language) {
    try {
      // Check if text is too long for single processing
      const maxChunkLength = 8000; // Conservative limit for gpt-4o-mini context

      if (text.length <= maxChunkLength) {
        // Process short text directly
        return await this.generateSingleSummary(text, language);
      } else {
        // Process long text with chunking strategy
        return await this.generateChunkedSummary(text, language, maxChunkLength);
      }

    } catch (error) {
      console.error('Error generating content summary:', error);
      // Return a fallback summary if AI generation fails
      return `원본 자막 내용 요약:

${text.substring(0, 500)}${text.length > 500 ? '...' : ''}

※ AI 요약 생성 중 오류가 발생하여 원본 텍스트의 일부만 표시됩니다.`;
    }
  }

  async generateSingleSummary(text, language) {
    const messages = [
      {
        role: 'system',
        content: `You are an educational content summarizer. Your task is to create a concise, well-structured summary of video transcription content for learning purposes.

Guidelines:
- Create a clear, organized summary that captures key concepts and learning points
- Use bullet points or numbered lists for better readability
- Focus on educational value and main takeaways
- Include important details, examples, or explanations mentioned in the content
- IMPORTANT: Keep the summary under 400 words (approximately 500 tokens)
- End with a complete sentence - do not cut off mid-sentence
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
      max_tokens: 500,
      temperature: 0.3
    });

    return response.choices[0].message.content;
  }

  async generateChunkedSummary(text, language, maxChunkLength) {
    // Split text into chunks at sentence boundaries
    const chunks = this.splitTextIntoChunks(text, maxChunkLength);
    console.log(`Processing long text: ${text.length} chars → ${chunks.length} chunks`);

    // Generate summary for each chunk
    const chunkSummaries = [];
    for (let i = 0; i < chunks.length; i++) {
      console.log(`Summarizing chunk ${i + 1}/${chunks.length}`);

      const chunkSummary = await this.generateSingleSummary(chunks[i], language);
      chunkSummaries.push(chunkSummary);

      // Add small delay to avoid rate limiting
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Combine chunk summaries into final summary
    const combinedSummaries = chunkSummaries.join('\n\n');

    // Generate final consolidated summary
    const finalMessages = [
      {
        role: 'system',
        content: `You are consolidating multiple summaries into one final comprehensive summary.

Guidelines:
- Merge the summaries while removing redundancy
- Maintain the key educational points from all parts
- Create a coherent, well-structured final summary
- IMPORTANT: Keep the final summary under 400 words (approximately 500 tokens)
- End with a complete sentence - do not cut off mid-sentence
- Respond in ${language === 'ko' ? 'Korean' : 'English'} language
- Use bullet points or numbered lists for clarity`
      },
      {
        role: 'user',
        content: `Please consolidate these partial summaries into one comprehensive educational summary:

${combinedSummaries}`
      }
    ];

    const finalResponse = await this.openaiService.createChatCompletion({
      messages: finalMessages,
      model: 'gpt-4o-mini',
      max_tokens: 500,
      temperature: 0.3
    });

    return finalResponse.choices[0].message.content;
  }

  splitTextIntoChunks(text, maxLength) {
    const chunks = [];
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

    let currentChunk = '';

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;

      const potentialChunk = currentChunk + (currentChunk ? '. ' : '') + trimmedSentence;

      if (potentialChunk.length <= maxLength) {
        currentChunk = potentialChunk;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk + '.');
        }
        // Handle very long sentences
        if (trimmedSentence.length > maxLength) {
          const words = trimmedSentence.split(' ');
          let wordChunk = '';
          for (const word of words) {
            if ((wordChunk + ' ' + word).length <= maxLength) {
              wordChunk = wordChunk ? wordChunk + ' ' + word : word;
            } else {
              if (wordChunk) chunks.push(wordChunk);
              wordChunk = word;
            }
          }
          currentChunk = wordChunk;
        } else {
          currentChunk = trimmedSentence;
        }
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk + '.');
    }

    return chunks.filter(chunk => chunk.trim().length > 50); // Filter out very short chunks
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