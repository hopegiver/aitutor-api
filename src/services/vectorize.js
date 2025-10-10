export class VectorizeService {
  constructor(vectorizeIndex, openaiService) {
    this.vectorizeIndex = vectorizeIndex;
    this.openaiService = openaiService;
  }

  /**
   * Split text into smart chunks based on sentences and size
   */
  createSmartChunks(text, maxChunkSize = 500) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const chunks = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) continue;

      const potentialChunk = currentChunk + (currentChunk ? '. ' : '') + trimmedSentence;

      if (potentialChunk.length <= maxChunkSize) {
        currentChunk = potentialChunk;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk + '.');
        }
        currentChunk = trimmedSentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk + '.');
    }

    return chunks.filter(chunk => chunk.trim().length > 20); // Filter out very short chunks
  }

  /**
   * Extract timestamps from VTT segments for chunk metadata
   */
  extractTimestampsFromSegments(segments, chunkText) {
    if (!segments || segments.length === 0) return { startTime: 0, endTime: 0 };

    // Find segments that contain words from this chunk
    const chunkWords = chunkText.toLowerCase().split(/\s+/).slice(0, 5); // First 5 words
    let startTime = 0;
    let endTime = 0;

    for (const segment of segments) {
      const segmentText = segment.text?.toLowerCase() || '';
      const hasMatch = chunkWords.some(word => segmentText.includes(word));

      if (hasMatch) {
        startTime = segment.start || 0;
        endTime = segment.end || startTime + 30; // Default 30 seconds if no end time
        break;
      }
    }

    return { startTime, endTime };
  }

  /**
   * Generate embedding using OpenAI
   */
  async generateEmbedding(text) {
    try {
      console.log('Generating embedding for text:', text.substring(0, 100) + '...');

      const response = await this.openaiService.createEmbedding({
        model: 'text-embedding-3-small',
        input: text,
        encoding_format: 'float'
      });

      console.log('Embedding response structure:', {
        hasData: !!response.data,
        dataLength: response.data?.length,
        hasEmbedding: !!response.data?.[0]?.embedding,
        embeddingLength: response.data?.[0]?.embedding?.length
      });

      if (!response.data || !response.data[0] || !response.data[0].embedding) {
        throw new Error('Invalid embedding response structure');
      }

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      console.error('Error details:', error.message);
      throw error;
    }
  }

  /**
   * Index content chunks in Vectorize
   */
  async indexContent(contentId, originalText, summary, segments = [], metadata = {}) {
    try {
      const vectors = [];

      // Chunk and index original transcript
      const transcriptChunks = this.createSmartChunks(originalText, 500);

      for (let i = 0; i < transcriptChunks.length; i++) {
        const chunk = transcriptChunks[i];
        const embedding = await this.generateEmbedding(chunk);
        const timestamps = this.extractTimestampsFromSegments(segments, chunk);

        vectors.push({
          id: `${contentId}-transcript-${i}`,
          values: embedding,
          metadata: {
            contentId,
            type: 'transcript',
            text: chunk,
            chunkIndex: i,
            startTime: timestamps.startTime,
            endTime: timestamps.endTime,
            language: metadata.language || 'ko',
            createdAt: new Date().toISOString(),
            ...metadata
          }
        });
      }

      // Index summary as a single chunk
      if (summary && summary.trim().length > 0) {
        const summaryEmbedding = await this.generateEmbedding(summary);
        vectors.push({
          id: `${contentId}-summary`,
          values: summaryEmbedding,
          metadata: {
            contentId,
            type: 'summary',
            text: summary,
            chunkIndex: -1, // Special index for summary
            startTime: 0,
            endTime: metadata.duration || 0,
            language: metadata.language || 'ko',
            createdAt: new Date().toISOString(),
            ...metadata
          }
        });
      }

      // Insert vectors in batches to avoid size limits
      const batchSize = 50;
      for (let i = 0; i < vectors.length; i += batchSize) {
        const batch = vectors.slice(i, i + batchSize);
        await this.vectorizeIndex.insert(batch);
      }

      console.log(`✅ Indexed ${vectors.length} chunks for content ${contentId}`);
      return {
        success: true,
        chunksIndexed: transcriptChunks.length,
        summaryIndexed: summary ? 1 : 0,
        totalVectors: vectors.length
      };

    } catch (error) {
      console.error(`Error indexing content ${contentId}:`, error);
      throw error;
    }
  }

  /**
   * Search for relevant content chunks
   */
  async searchContent(query, options = {}) {
    try {
      const {
        topK = 10,
        contentId = null,
        type = null, // 'transcript' | 'summary'
        language = null,
        includeMetadata = true
      } = options;

      // Generate embedding for the search query
      const queryEmbedding = await this.generateEmbedding(query);

      console.log('Search query embedding check:', {
        hasEmbedding: !!queryEmbedding,
        embeddingLength: queryEmbedding?.length,
        embeddingType: typeof queryEmbedding,
        isArray: Array.isArray(queryEmbedding),
        firstFewValues: queryEmbedding?.slice(0, 3)
      });

      if (!queryEmbedding || queryEmbedding.length === 0) {
        console.error('Failed to generate query embedding');
        return {
          query,
          results: [],
          total: 0,
          error: 'Failed to generate embedding for search query'
        };
      }

      // Build filter conditions
      const filter = {};
      if (contentId) filter.contentId = contentId;
      if (type) filter.type = type;
      if (language) filter.language = language;

      // Perform vector search
      const searchOptions = {
        vector: queryEmbedding,
        topK,
        includeMetadata,
        includeValues: false
      };

      if (Object.keys(filter).length > 0) {
        searchOptions.filter = filter;
      }

      const results = await this.vectorizeIndex.query(searchOptions);

      // Format results
      const formattedResults = results.matches?.map(match => ({
        id: match.id,
        score: match.score,
        contentId: match.metadata?.contentId,
        type: match.metadata?.type,
        text: match.metadata?.text,
        chunkIndex: match.metadata?.chunkIndex,
        startTime: match.metadata?.startTime,
        endTime: match.metadata?.endTime,
        language: match.metadata?.language,
        createdAt: match.metadata?.createdAt
      })) || [];

      return {
        query,
        results: formattedResults,
        total: formattedResults.length
      };

    } catch (error) {
      console.error('Error searching content:', error);
      throw error;
    }
  }

  /**
   * Get content context for AI chat
   */
  async getContentContext(query, maxChunks = 5) {
    try {
      const searchResults = await this.searchContent(query, {
        topK: maxChunks,
        type: null // Include both transcript and summary
      });

      if (!searchResults.results || searchResults.results.length === 0) {
        return {
          hasContext: false,
          context: '',
          sources: []
        };
      }

      // Sort by relevance score and format context
      const relevantChunks = searchResults.results
        .filter(result => result.score > 0.7) // Minimum relevance threshold
        .slice(0, maxChunks);

      if (relevantChunks.length === 0) {
        return {
          hasContext: false,
          context: '',
          sources: []
        };
      }

      // Build context string
      const contextParts = relevantChunks.map((chunk, index) => {
        const timeInfo = chunk.startTime && chunk.endTime
          ? ` (${this.formatTime(chunk.startTime)}-${this.formatTime(chunk.endTime)})`
          : '';

        return `[강의 자료 ${index + 1}${timeInfo}]\n${chunk.text}`;
      });

      const context = contextParts.join('\n\n');

      // Extract source information
      const sources = relevantChunks.map(chunk => ({
        contentId: chunk.contentId,
        type: chunk.type,
        score: chunk.score,
        startTime: chunk.startTime,
        endTime: chunk.endTime
      }));

      return {
        hasContext: true,
        context,
        sources,
        relevantChunks: relevantChunks.length
      };

    } catch (error) {
      console.error('Error getting content context:', error);
      return {
        hasContext: false,
        context: '',
        sources: [],
        error: error.message
      };
    }
  }

  /**
   * Format time in seconds to MM:SS format
   */
  formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  /**
   * Delete all vectors for a specific content ID
   */
  async deleteContent(contentId) {
    try {
      // Note: Vectorize doesn't have a direct delete by metadata filter
      // We need to search first, then delete by IDs
      const searchResults = await this.searchContent('', {
        contentId,
        topK: 1000 // Get all chunks for this content
      });

      const vectorIds = searchResults.results.map(result => result.id);

      if (vectorIds.length > 0) {
        await this.vectorizeIndex.deleteByIds(vectorIds);
        console.log(`✅ Deleted ${vectorIds.length} vectors for content ${contentId}`);
      }

      return { deleted: vectorIds.length };

    } catch (error) {
      console.error(`Error deleting content ${contentId}:`, error);
      throw error;
    }
  }

  /**
   * Get content statistics
   */
  async getContentStats() {
    try {
      // This is a simplified version - Vectorize doesn't have direct stats API
      // We would need to implement a counter in KV or similar
      return {
        totalVectors: 'N/A', // Vectorize doesn't expose this directly
        message: 'Content statistics available through search queries'
      };
    } catch (error) {
      console.error('Error getting content stats:', error);
      throw error;
    }
  }
}