export class WhisperService {
  constructor(apiKey, endpoint, apiVersion = '2025-01-01-preview') {
    this.apiKey = apiKey;
    this.endpoint = endpoint;
    this.apiVersion = apiVersion;
    this.baseUrl = `${endpoint}/openai/deployments/whisper-1/audio/transcriptions`;
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
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.mp3');
      formData.append('model', 'whisper-1');

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
        throw new Error(`OpenAI API error: ${response.status} ${errorData}`);
      }

      const result = await response.json();
      return this.formatTranscriptionResult(result, options);

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