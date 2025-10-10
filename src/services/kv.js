export class KVService {
  constructor(kv) {
    this.kv = kv;
  }

  async getContent(contentId) {
    const contentDataStr = await this.kv.get(`content:info:${contentId}`);
    return contentDataStr ? JSON.parse(contentDataStr) : null;
  }

  async setContent(contentId, contentData) {
    await this.kv.put(`content:info:${contentId}`, JSON.stringify(contentData));
  }

  async updateContentStatus(contentId, status, updates = {}) {
    const contentData = await this.getContent(contentId);
    if (!contentData) {
      throw new Error(`Content ${contentId} not found`);
    }

    const updatedContent = {
      ...contentData,
      status,
      updatedAt: new Date().toISOString(),
      ...updates
    };

    await this.setContent(contentId, updatedContent);
    return updatedContent;
  }

  async setContentResult(contentId, result, metadata = {}) {
    const contentData = await this.getContent(contentId);
    if (!contentData) {
      throw new Error(`Content ${contentId} not found`);
    }

    const updatedContent = {
      ...contentData,
      status: 'completed',
      result,
      metadata: {
        ...contentData.metadata,
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

    await this.setContent(contentId, updatedContent);
    return updatedContent;
  }

  async setContentError(contentId, error) {
    const contentData = await this.getContent(contentId);
    if (!contentData) {
      throw new Error(`Content ${contentId} not found`);
    }

    const updatedContent = {
      ...contentData,
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

    await this.setContent(contentId, updatedContent);
    return updatedContent;
  }

  async deleteContent(contentId) {
    await this.kv.delete(`content:info:${contentId}`);
  }

  async listContents(limit = 100) {
    const { keys } = await this.kv.list({ prefix: 'content:info:', limit });
    const contents = [];

    for (const key of keys) {
      const contentData = await this.getContent(key.name.replace('content:info:', ''));
      if (contentData) {
        contents.push({
          contentId: contentData.contentId,
          status: contentData.status,
          createdAt: contentData.createdAt,
          updatedAt: contentData.updatedAt
        });
      }
    }

    return contents;
  }

  // Content Info (metadata only)
  async setContentInfo(contentId, infoData) {
    await this.kv.put(`content:info:${contentId}`, JSON.stringify(infoData));
  }

  async getContentInfo(contentId) {
    const infoDataStr = await this.kv.get(`content:info:${contentId}`);
    return infoDataStr ? JSON.parse(infoDataStr) : null;
  }

  // Content Subtitle (transcription results)
  async setContentSubtitle(contentId, subtitleData) {
    await this.kv.put(`content:subtitle:${contentId}`, JSON.stringify(subtitleData));
  }

  async getContentSubtitle(contentId) {
    const subtitleDataStr = await this.kv.get(`content:subtitle:${contentId}`);
    return subtitleDataStr ? JSON.parse(subtitleDataStr) : null;
  }

  // Content Summary (AI generated)
  async setContentSummary(contentId, summaryData) {
    await this.kv.put(`content:summary:${contentId}`, JSON.stringify(summaryData));
  }

  async getContentSummary(contentId) {
    const summaryDataStr = await this.kv.get(`content:summary:${contentId}`);
    return summaryDataStr ? JSON.parse(summaryDataStr) : null;
  }

  async listContentSummaries(limit = 100) {
    const { keys } = await this.kv.list({ prefix: 'content:summary:', limit });
    const summaries = [];

    for (const key of keys) {
      const contentId = key.name.replace('content:summary:', '');
      const summaryData = await this.getContentSummary(contentId);
      if (summaryData) {
        summaries.push({
          contentId,
          language: summaryData.language,
          duration: summaryData.duration,
          videoUrl: summaryData.videoUrl,
          createdAt: summaryData.createdAt
        });
      }
    }

    return summaries;
  }

  async listContentSubtitles(limit = 100) {
    const { keys } = await this.kv.list({ prefix: 'content:subtitle:', limit });
    const subtitles = [];

    for (const key of keys) {
      const contentId = key.name.replace('content:subtitle:', '');
      const subtitleData = await this.getContentSubtitle(contentId);
      if (subtitleData) {
        subtitles.push({
          contentId,
          language: subtitleData.language,
          duration: subtitleData.duration,
          format: subtitleData.format,
          source: subtitleData.source,
          videoUrl: subtitleData.videoUrl,
          createdAt: subtitleData.createdAt
        });
      }
    }

    return subtitles;
  }

  async listContentInfos(limit = 100) {
    const { keys } = await this.kv.list({ prefix: 'content:info:', limit });
    const infos = [];

    for (const key of keys) {
      const contentId = key.name.replace('content:info:', '');
      const infoData = await this.getContentInfo(contentId);
      if (infoData) {
        infos.push({
          contentId,
          ...infoData
        });
      }
    }

    return infos;
  }

  async updateContentProgress(contentId, stage, percentage, message) {
    const contentData = await this.getContentInfo(contentId);
    if (!contentData) {
      throw new Error(`Content ${contentId} not found`);
    }

    const updatedContent = {
      ...contentData,
      progress: {
        stage,
        percentage,
        message
      },
      updatedAt: new Date().toISOString()
    };

    await this.setContentInfo(contentId, updatedContent);
    return updatedContent;
  }
}