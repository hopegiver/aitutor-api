import OpenAI from 'openai';

export class WhisperService {
  constructor(apiKey, endpoint, apiVersion = '2024-06-01', accountId = null) {
    this.apiKey = apiKey;
    this.endpoint = endpoint;
    this.apiVersion = apiVersion;

    // AI Gateway 설정 (하드코딩된 gateway ID 'aitutor' 사용)
    if (accountId && apiKey && !apiKey.startsWith('1fQ')) {
      // Cloudflare AI Gateway를 통한 OpenAI Whisper 접근
      this.baseUrl = `https://gateway.ai.cloudflare.com/v1/${accountId}/aitutor/openai`;
      this.isAzure = false;

      // OpenAI 클라이언트 초기화 (Whisper용)
      this.client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: this.baseUrl,
      });
    } else {
      // 기존 Azure Cognitive Services 엔드포인트 (fallback)
      this.baseUrl = `${endpoint}/openai/deployments/whisper/audio/transcriptions`;
      this.isAzure = true;
    }
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
      console.error('Error transcribing from URL:', error);
      throw error;
    }
  }

  async transcribeFromBlob(audioBlob, options = {}) {
    try {
      console.log('Using AI Gateway for Whisper:', !this.isAzure);

      if (!this.isAzure && this.client) {
        // Cloudflare AI Gateway를 통한 OpenAI Whisper 호출
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

      } else {
        // Azure Cognitive Services 기존 방식 (fallback)
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.mp3');
        formData.append('model', 'whisper');

        if (options.language) {
          formData.append('language', options.language);
        }

        if (options.format) {
          formData.append('response_format', options.format);
        } else {
          formData.append('response_format', 'verbose_json');
        }

        if (options.timestamps !== false) {
          formData.append('timestamp_granularities[]', 'segment');
          if (options.wordTimestamps) {
            formData.append('timestamp_granularities[]', 'word');
          }
        }

        const response = await fetch(`${this.baseUrl}?api-version=${this.apiVersion}`, {
          method: 'POST',
          headers: {
            'api-key': this.apiKey
          },
          body: formData
        });

        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(`Azure Whisper API error: ${response.status} ${errorData}`);
        }

        const result = await response.json();
        return this.formatTranscriptionResult(result, options);
      }

    } catch (error) {
      console.error('Error transcribing audio:', error);
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