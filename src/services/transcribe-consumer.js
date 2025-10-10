import { KVService } from './kv.js';
import { QueueService } from './queue.js';
import { StreamService } from './stream.js';
import { WhisperService } from './whisper.js';

export class TranscribeConsumer {
  constructor(env) {
    this.kvService = new KVService(env.TRANSCRIBE_KV);
    this.queueService = new QueueService(env.TRANSCRIBE_QUEUE);
    this.streamService = new StreamService(env.CLOUDFLARE_ACCOUNT_ID, env.STREAM_API_TOKEN);
    this.whisperService = new WhisperService(
      env.WHISPER_API_KEY || env.OPENAI_API_KEY,
      env.WHISPER_ENDPOINT || env.OPENAI_ENDPOINT || 'https://info-mg6frpzu-eastus2.cognitiveservices.azure.com',
      env.WHISPER_API_VERSION || '2024-06-01'
    );
  }

  async handleMessage(message) {
    const { jobId, action } = message;

    try {
      console.log(`Processing job ${jobId} with action ${action}`);

      switch (action) {
        case 'process_video':
          await this.processVideo(jobId);
          break;
        case 'transcribe_audio':
          await this.transcribeAudio(jobId, message.audioUrl);
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }

    } catch (error) {
      console.error(`Error processing job ${jobId}:`, error);
      await this.kvService.setJobError(jobId, error);
    }
  }

  async processVideo(jobId) {
    const jobData = await this.kvService.getJob(jobId);
    if (!jobData) {
      throw new Error(`Job ${jobId} not found`);
    }

    await this.kvService.updateJobStatus(jobId, 'processing');
    await this.kvService.updateJobProgress(jobId, 'uploading', 10, 'Uploading video to Cloudflare Stream');

    try {
      const streamResult = await this.streamService.uploadVideoFromUrl(jobData.videoUrl, {
        name: `Transcription Job ${jobId}`,
        jobId: jobId
      });

      await this.kvService.updateJobProgress(jobId, 'processing', 30, 'Video uploaded, waiting for processing');

      const processedVideo = await this.streamService.waitForProcessing(streamResult.uid);

      await this.kvService.updateJobProgress(jobId, 'extracting', 60, 'Extracting audio from video');

      const audioUrl = await this.streamService.getAudioDownloadUrl(streamResult.uid);

      await this.kvService.updateJobProgress(jobId, 'transcribing', 70, 'Starting audio transcription');

      await this.transcribeAudio(jobId, audioUrl, streamResult.uid);

    } catch (error) {
      console.error(`Error processing video for job ${jobId}:`, error);
      throw error;
    }
  }

  async transcribeAudio(jobId, audioUrl, streamVideoId = null) {
    const jobData = await this.kvService.getJob(jobId);
    if (!jobData) {
      throw new Error(`Job ${jobId} not found`);
    }

    await this.kvService.updateJobProgress(jobId, 'transcribing', 80, 'Transcribing audio with Whisper');

    try {
      const transcriptionOptions = {
        language: this.mapLanguageCode(jobData.language),
        format: jobData.options.format || 'srt',
        timestamps: jobData.options.timestamps !== false,
        wordTimestamps: jobData.options.wordTimestamps || false
      };

      const transcriptionResult = await this.whisperService.transcribeFromUrl(audioUrl, transcriptionOptions);

      const metadata = {
        duration: transcriptionResult.duration,
        wordCount: transcriptionResult.text.split(' ').length,
        segmentCount: transcriptionResult.segments?.length || 0,
        audioUrl: audioUrl
      };

      if (streamVideoId) {
        metadata.streamVideoId = streamVideoId;
      }

      await this.kvService.setJobResult(jobId, transcriptionResult, metadata);

      if (streamVideoId) {
        try {
          await this.streamService.deleteVideo(streamVideoId);
        } catch (error) {
          console.warn(`Failed to delete video ${streamVideoId}:`, error);
        }
      }

      console.log(`Job ${jobId} completed successfully`);

    } catch (error) {
      console.error(`Error transcribing audio for job ${jobId}:`, error);
      throw error;
    }
  }

  mapLanguageCode(language) {
    const languageMap = {
      'ko-KR': 'ko',
      'en-US': 'en',
      'ja-JP': 'ja',
      'zh-CN': 'zh',
      'es-ES': 'es',
      'fr-FR': 'fr',
      'de-DE': 'de',
      'it-IT': 'it',
      'pt-PT': 'pt',
      'ru-RU': 'ru'
    };

    return languageMap[language] || language.split('-')[0] || 'auto';
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