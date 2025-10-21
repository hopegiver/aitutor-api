export class VectorizeService {
  constructor(vectorizeIndex, openaiService) {
    this.vectorizeIndex = vectorizeIndex;
    this.openaiService = openaiService;
  }

  /**
   * Create chunks based on segments with smart merging for optimal size
   */
  createSegmentBasedChunks(segments, minChunkSize = 200, maxChunkSize = 500) {
    if (!segments || segments.length === 0) {
      return [];
    }

    const chunks = [];
    let currentChunk = {
      text: '',
      startTime: 0,
      endTime: 0,
      segmentCount: 0
    };

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (!segment.text || !segment.text.trim()) continue;

      const segmentText = segment.text.trim();
      const potentialText = currentChunk.text + (currentChunk.text ? ' ' : '') + segmentText;

      // Start new chunk if this is the first segment
      if (currentChunk.segmentCount === 0) {
        currentChunk = {
          text: segmentText,
          startTime: segment.start || 0,
          endTime: segment.end || 0,
          segmentCount: 1
        };
      }
      // Add to current chunk if within size limits
      else if (potentialText.length <= maxChunkSize) {
        currentChunk.text = potentialText;
        currentChunk.endTime = segment.end || currentChunk.endTime;
        currentChunk.segmentCount++;
      }
      // Finalize current chunk if it meets minimum size, start new one
      else {
        if (currentChunk.text.length >= minChunkSize) {
          chunks.push({...currentChunk});
        }

        currentChunk = {
          text: segmentText,
          startTime: segment.start || 0,
          endTime: segment.end || 0,
          segmentCount: 1
        };
      }
    }

    // Add the last chunk if it meets minimum size
    if (currentChunk.text && currentChunk.text.length >= minChunkSize) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  /**
   * Generate embedding using OpenAI
   */
  async generateEmbedding(text) {
    try {
      // Use the simplified createEmbedding method that returns the embedding directly
      const embedding = await this.openaiService.createEmbedding(text, {
        model: 'text-embedding-3-small',
        encoding_format: 'float'
      });

      if (!embedding || !Array.isArray(embedding) || embedding.length !== 1536) {
        throw new Error(`Invalid embedding: length=${embedding?.length}, isArray=${Array.isArray(embedding)}`);
      }

      return embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  /**
   * Index content chunks in Vectorize
   */
  async indexContent(contentId, summary, segments = [], metadata = {}) {
    try {
      const vectors = [];

      // Ensure contentId is always stored as string for consistent filtering
      const contentIdString = String(contentId);

      // Use segment-based chunking with smart merging for better timestamps
      const transcriptChunks = this.createSegmentBasedChunks(segments, 200, 500);

      for (let i = 0; i < transcriptChunks.length; i++) {
        const chunk = transcriptChunks[i];
        const embedding = await this.generateEmbedding(chunk.text);

        vectors.push({
          id: `${contentIdString}-transcript-${i}`,
          values: embedding, // Keep as plain array for better serialization compatibility
          metadata: {
            contentId: contentIdString,
            type: 'transcript',
            text: chunk.text,
            chunkIndex: i,
            startTime: chunk.startTime,
            endTime: chunk.endTime,
            segmentCount: chunk.segmentCount,
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
          id: `${contentIdString}-summary`,
          values: summaryEmbedding, // Keep as plain array for better serialization compatibility
          metadata: {
            contentId: contentIdString,
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

      if (!queryEmbedding || queryEmbedding.length === 0) {
        return {
          query,
          results: [],
          total: 0,
          error: 'Failed to generate embedding for search query'
        };
      }

      // Convert to Float32Array for optimal Vectorize performance
      const vectorArray = queryEmbedding instanceof Float32Array
        ? queryEmbedding
        : new Float32Array(queryEmbedding);

      // Build filter conditions
      const filter = {};
      // Ensure contentId is converted to string for consistent filtering
      if (contentId) filter.contentId = String(contentId);
      if (type) filter.type = type;
      if (language) filter.language = language;

      // Perform vector search with correct format
      const searchOptions = {
        topK,
        returnMetadata: includeMetadata ? "all" : "none",
        returnValues: false
      };

      if (Object.keys(filter).length > 0) {
        searchOptions.filter = filter;
      }

      const results = await this.vectorizeIndex.query(vectorArray, searchOptions);

      // Format results
      let formattedResults = results.matches?.map(match => ({
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

      // Client-side filtering as fallback (in case metadata index is not ready)
      if (contentId && formattedResults.length > 0) {
        const contentIdString = String(contentId);
        console.log(`🔍 Filtering results by contentId: ${contentIdString}`);
        console.log(`📊 Total results before filtering: ${formattedResults.length}`);
        const filteredByContentId = formattedResults.filter(result => String(result.contentId) === contentIdString);
        console.log(`📊 Filtered results: ${filteredByContentId.length}`);
        if (filteredByContentId.length > 0) {
          formattedResults = filteredByContentId;
        }
        // If no results match contentId, keep all results (metadata filter might work)
      }

      return {
        query,
        results: formattedResults,
        total: formattedResults.length,
        debug: contentId ? { requestedContentId: contentId, metadataFilterApplied: Object.keys(filter).length > 0 } : undefined
      };

    } catch (error) {
      console.error('Error searching content:', error);
      throw error;
    }
  }

  /**
   * Get content context for AI chat
   */
  async getContentContext(query, maxChunks = 3, searchOptions = {}) {
    try {
      // Get more samples for score distribution analysis
      const searchResults = await this.searchContent(query, {
        topK: 5, // Analyze 5 samples for better distribution analysis
        type: null, // Include both transcript and summary
        ...searchOptions
      });

      if (!searchResults.results || searchResults.results.length === 0) {
        return {
          hasContext: false,
          context: '',
          sources: []
        };
      }

      // Dynamic relevance detection based on score distribution
      const scores = searchResults.results.map(r => r.score);
      const maxScore = Math.max(...scores);
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const scoreGap = maxScore - avgScore;

      console.log(`🎯 Score analysis: max=${maxScore.toFixed(3)}, avg=${avgScore.toFixed(3)}, gap=${scoreGap.toFixed(3)}`);

      // Dynamic relevance criteria: meaningful score gap and minimum threshold
      const isRelevant = scoreGap > 0.015 && maxScore > 0.3;

      if (!isRelevant) {
        console.log('❌ Content not relevant based on score distribution');
        return {
          hasContext: false,
          context: '',
          sources: []
        };
      }

      // Use basic threshold for actual content selection (top 3)
      const relevantChunks = searchResults.results
        .filter(result => result.score > 0.1) // Basic threshold for content selection
        .slice(0, maxChunks); // Use only top 3 chunks

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
      // Ensure contentId is string for consistent filtering
      const contentIdString = String(contentId);

      // Note: Vectorize doesn't have a direct delete by metadata filter
      // We need to search first, then delete by IDs
      const searchResults = await this.searchContent('', {
        contentId: contentIdString,
        topK: 1000 // Get all chunks for this content
      });

      const vectorIds = searchResults.results.map(result => result.id);

      if (vectorIds.length > 0) {
        await this.vectorizeIndex.deleteByIds(vectorIds);
        console.log(`✅ Deleted ${vectorIds.length} vectors for content ${contentIdString}`);
      }

      return { deleted: vectorIds.length };

    } catch (error) {
      console.error(`Error deleting content ${contentIdString}:`, error);
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