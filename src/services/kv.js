export class KVService {
  constructor(kv) {
    this.kv = kv;
  }

  async getJob(jobId) {
    const jobDataStr = await this.kv.get(`job:${jobId}`);
    return jobDataStr ? JSON.parse(jobDataStr) : null;
  }

  async saveJob(jobId, jobData) {
    await this.kv.put(`job:${jobId}`, JSON.stringify(jobData));
  }

  async updateJobStatus(jobId, status, updates = {}) {
    const jobData = await this.getJob(jobId);
    if (!jobData) {
      throw new Error(`Job ${jobId} not found`);
    }

    const updatedJob = {
      ...jobData,
      status,
      updatedAt: new Date().toISOString(),
      ...updates
    };

    await this.saveJob(jobId, updatedJob);
    return updatedJob;
  }

  async updateJobProgress(jobId, stage, percentage, message) {
    const jobData = await this.getJob(jobId);
    if (!jobData) {
      throw new Error(`Job ${jobId} not found`);
    }

    const updatedJob = {
      ...jobData,
      progress: {
        stage,
        percentage,
        message
      },
      updatedAt: new Date().toISOString()
    };

    await this.saveJob(jobId, updatedJob);
    return updatedJob;
  }

  async setJobResult(jobId, result, metadata = {}) {
    const jobData = await this.getJob(jobId);
    if (!jobData) {
      throw new Error(`Job ${jobId} not found`);
    }

    const updatedJob = {
      ...jobData,
      status: 'completed',
      result,
      metadata: {
        ...jobData.metadata,
        ...metadata
      },
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: {
        stage: 'completed',
        percentage: 100,
        message: 'Transcription completed successfully'
      }
    };

    await this.saveJob(jobId, updatedJob);
    return updatedJob;
  }

  async setJobError(jobId, error) {
    const jobData = await this.getJob(jobId);
    if (!jobData) {
      throw new Error(`Job ${jobId} not found`);
    }

    const updatedJob = {
      ...jobData,
      status: 'failed',
      error: {
        message: error.message || 'Unknown error',
        timestamp: new Date().toISOString()
      },
      updatedAt: new Date().toISOString(),
      progress: {
        stage: 'failed',
        percentage: 0,
        message: `Error: ${error.message || 'Unknown error'}`
      }
    };

    await this.saveJob(jobId, updatedJob);
    return updatedJob;
  }

  async deleteJob(jobId) {
    await this.kv.delete(`job:${jobId}`);
  }

  async listJobs(limit = 100) {
    const { keys } = await this.kv.list({ prefix: 'job:', limit });
    const jobs = [];

    for (const key of keys) {
      const jobData = await this.getJob(key.name.replace('job:', ''));
      if (jobData) {
        jobs.push({
          id: jobData.id,
          status: jobData.status,
          createdAt: jobData.createdAt,
          updatedAt: jobData.updatedAt
        });
      }
    }

    return jobs;
  }
}