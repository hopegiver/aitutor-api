import OpenAI from 'openai';

export class WhisperService {
  constructor(apiKey, accountId) {
    if (!apiKey || !accountId) {
      throw new Error('OpenAI API key and Cloudflare account ID are required');
    }

    this.apiKey = apiKey;

    // Cloudflare AI Gateway를 통한 OpenAI Whisper 접근 (하드코딩된 gateway ID 'aitutor' 사용)
    this.baseUrl = `https://gateway.ai.cloudflare.com/v1/${accountId}/aitutor/openai`;

    // OpenAI 클라이언트 초기화 (Whisper용)
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
    });
  }

  async transcribeFromUrl(audioUrl, options = {}) {
    try {
      const audioResponse = await fetch(audioUrl);
      if (!audioResponse.ok) {
        throw new Error(`Failed to fetch audio: ${audioResponse.statusText}`);
      }

      const audioBuffer = await audioResponse.arrayBuffer();
      const audioBlob = new Blob([audioBuffer], { type: 'audio/mp3' });

      return await this.transcribeFromBlob(audioBlob, options);

    } catch (error) {
      console.error('Transcription from URL failed:', error.message);
      throw error;
    }
  }

  async transcribeFromBlob(audioBlob, options = {}) {
    try {
      const transcriptionOptions = {
        file: audioBlob,
        model: 'whisper-1',
        response_format: options.format || 'verbose_json'
      };

      if (options.language) {
        transcriptionOptions.language = options.language;
      }

      if (options.timestamps !== false) {
        transcriptionOptions.timestamp_granularities = ['segment'];
        if (options.wordTimestamps) {
          transcriptionOptions.timestamp_granularities.push('word');
        }
      }

      const result = await this.client.audio.transcriptions.create(transcriptionOptions);
      return this.formatTranscriptionResult(result, options);

    } catch (error) {
      console.error('Audio transcription failed:', error.message);
      throw error;
    }
  }

  formatTranscriptionResult(result, options) {
    const formatted = {
      text: result.text,
      language: result.language,
      duration: result.duration,
      segments: result.segments || [],
      words: result.words || []
    };

    if (options.format === 'srt') {
      formatted.srt = this.convertToSRT(result.segments || []);
    } else if (options.format === 'vtt') {
      formatted.vtt = this.convertToVTT(result.segments || []);
    }

    return formatted;
  }

  convertToSRT(segments) {
    return segments.map((segment, index) => {
      const startTime = this.formatSRTTime(segment.start);
      const endTime = this.formatSRTTime(segment.end);
      return `${index + 1}\n${startTime} --> ${endTime}\n${segment.text.trim()}\n`;
    }).join('\n');
  }

  convertToVTT(segments) {
    const header = 'WEBVTT\n\n';
    const content = segments.map(segment => {
      const startTime = this.formatVTTTime(segment.start);
      const endTime = this.formatVTTTime(segment.end);
      return `${startTime} --> ${endTime}\n${segment.text.trim()}\n`;
    }).join('\n');
    return header + content;
  }

  formatSRTTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  }

  formatVTTTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = (seconds % 60).toFixed(3);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.padStart(6, '0')}`;
  }
}