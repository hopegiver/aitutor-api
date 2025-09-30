export class QueueService {
  constructor(queue) {
    this.queue = queue;
  }

  async sendJob(jobId, action, additionalData = {}) {
    const message = {
      jobId,
      action,
      timestamp: new Date().toISOString(),
      ...additionalData
    };

    await this.queue.send(message);
    return message;
  }

  async sendProcessVideo(jobId) {
    return this.sendJob(jobId, 'process_video');
  }

  async sendTranscribeAudio(jobId, audioUrl) {
    return this.sendJob(jobId, 'transcribe_audio', { audioUrl });
  }
}