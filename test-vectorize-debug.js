// Debug Test Script for Vectorize Service
// This script directly tests VectorizeService functionality with detailed logging

import { VectorizeService } from './src/services/vectorize.js';
import { OpenAIService } from './src/services/openai.js';

// Mock Vectorize Index with detailed debugging
class DebugVectorizeIndex {
  constructor() {
    this.vectors = new Map();
    this.insertCount = 0;
    this.queryCount = 0;
    this.debug = true;
  }

  log(message, data = null) {
    if (this.debug) {
      console.log(`[DEBUG-VECTORIZE] ${message}`);
      if (data) {
        console.log(`[DEBUG-VECTORIZE] Data:`, JSON.stringify(data, null, 2));
      }
    }
  }

  async insert(vectorBatch) {
    this.log(`Insert called with ${vectorBatch.length} vectors`);

    for (const vector of vectorBatch) {
      // Validate vector structure
      if (!vector.id) {
        throw new Error('Vector missing ID');
      }
      if (!vector.values || !Array.isArray(vector.values)) {
        throw new Error('Vector missing or invalid values array');
      }
      if (vector.values.length === 0) {
        throw new Error('Vector values array is empty');
      }
      if (!vector.metadata) {
        throw new Error('Vector missing metadata');
      }

      this.log(`Storing vector ${vector.id}`, {
        dimensions: vector.values.length,
        metadata: vector.metadata
      });

      this.vectors.set(vector.id, {
        id: vector.id,
        values: [...vector.values], // Deep copy
        metadata: { ...vector.metadata } // Deep copy
      });
      this.insertCount++;
    }

    this.log(`Insert completed. Total vectors stored: ${this.vectors.size}`);
    return { success: true };
  }

  async query(searchOptions) {
    this.queryCount++;
    this.log(`Query #${this.queryCount} called`, {
      vectorDimensions: searchOptions.vector?.length,
      topK: searchOptions.topK,
      filter: searchOptions.filter,
      includeMetadata: searchOptions.includeMetadata
    });

    // Validate query vector
    if (!searchOptions.vector || !Array.isArray(searchOptions.vector)) {
      const error = 'Query vector is missing or not an array';
      this.log(`ERROR: ${error}`);
      throw new Error(error);
    }

    if (searchOptions.vector.length === 0) {
      const error = 'Query vector is empty';
      this.log(`ERROR: ${error}`);
      throw new Error(error);
    }

    const allVectors = Array.from(this.vectors.values());
    this.log(`Searching through ${allVectors.length} stored vectors`);

    if (allVectors.length === 0) {
      this.log('No vectors in index - returning empty results');
      return { matches: [] };
    }

    // Apply filters
    let filteredVectors = allVectors;
    if (searchOptions.filter && Object.keys(searchOptions.filter).length > 0) {
      this.log(`Applying filters:`, searchOptions.filter);

      filteredVectors = allVectors.filter(vector => {
        for (const [key, value] of Object.entries(searchOptions.filter)) {
          if (vector.metadata[key] !== value) {
            return false;
          }
        }
        return true;
      });

      this.log(`After filtering: ${filteredVectors.length} vectors remain`);
    }

    if (filteredVectors.length === 0) {
      this.log('No vectors match filter criteria');
      return { matches: [] };
    }

    // Calculate similarities
    const results = [];
    const queryVector = searchOptions.vector;

    for (const vector of filteredVectors) {
      // Check dimension compatibility
      if (vector.values.length !== queryVector.length) {
        this.log(`WARNING: Dimension mismatch for vector ${vector.id}: ${vector.values.length} vs ${queryVector.length}`);
        continue;
      }

      const score = this.calculateCosineSimilarity(queryVector, vector.values);
      results.push({
        id: vector.id,
        score: score,
        metadata: searchOptions.includeMetadata ? vector.metadata : undefined
      });
    }

    // Sort by score and limit
    results.sort((a, b) => b.score - a.score);
    const limitedResults = results.slice(0, searchOptions.topK || 10);

    this.log(`Returning ${limitedResults.length} results:`);
    limitedResults.forEach((result, i) => {
      this.log(`  ${i + 1}. ${result.id} (score: ${result.score.toFixed(6)})`);
    });

    return { matches: limitedResults };
  }

  calculateCosineSimilarity(vec1, vec2) {
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }

    return dotProduct / (norm1 * norm2);
  }

  async deleteByIds(vectorIds) {
    this.log(`Delete called for ${vectorIds.length} vector IDs`);

    let deletedCount = 0;
    for (const id of vectorIds) {
      if (this.vectors.has(id)) {
        this.vectors.delete(id);
        deletedCount++;
        this.log(`Deleted vector: ${id}`);
      } else {
        this.log(`Vector not found for deletion: ${id}`);
      }
    }

    this.log(`Deletion completed: ${deletedCount} vectors deleted, ${this.vectors.size} remaining`);
    return { success: true };
  }

  getStoredVectors() {
    return Array.from(this.vectors.values());
  }

  getStats() {
    return {
      totalVectors: this.vectors.size,
      insertCalls: this.insertCount,
      queryCalls: this.queryCount,
      vectorIds: Array.from(this.vectors.keys())
    };
  }

  clear() {
    this.vectors.clear();
    this.insertCount = 0;
    this.queryCount = 0;
    this.log('Index cleared');
  }
}

// Mock OpenAI Service for testing (to avoid API costs)
class MockOpenAIService {
  constructor() {
    this.callCount = 0;
  }

  async createEmbedding(params) {
    this.callCount++;
    console.log(`[MOCK-OPENAI] createEmbedding call #${this.callCount}:`, {
      model: params.model,
      inputLength: params.input?.length,
      inputPreview: params.input?.substring(0, 50) + '...'
    });

    // Generate a mock embedding based on the input text
    // This creates a deterministic but realistic-looking embedding
    const dimensions = 1536; // text-embedding-3-small dimensions
    const embedding = [];

    // Create a simple hash of the input text to make embeddings deterministic
    let hash = 0;
    for (let i = 0; i < params.input.length; i++) {
      const char = params.input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    // Generate embedding values
    for (let i = 0; i < dimensions; i++) {
      // Use hash and index to create pseudo-random but deterministic values
      const value = Math.sin(hash + i) * 0.1;
      embedding.push(value);
    }

    // Normalize the embedding
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= norm;
    }

    console.log(`[MOCK-OPENAI] Generated ${dimensions}D embedding`);

    return {
      data: [{
        embedding: embedding,
        index: 0
      }]
    };
  }
}

// Test data
const TEST_DATA = {
  contentId: 'debug-test-001',
  originalText: `
    안녕하세요. 오늘은 JavaScript의 변수 선언에 대해 배워보겠습니다.
    JavaScript에서는 let, const, var 세 가지 키워드로 변수를 선언할 수 있습니다.
    let은 블록 스코프를 가지며 재할당이 가능합니다.
    const는 블록 스코프를 가지며 재할당이 불가능합니다.
    var는 함수 스코프를 가지며 호이스팅됩니다.
    모던 JavaScript에서는 const를 우선적으로 사용하고, 재할당이 필요한 경우에만 let을 사용합니다.
  `,
  summary: `JavaScript 변수 선언에 대한 강의입니다. let, const, var의 차이점과 스코프, 호이스팅에 대해 설명합니다.`,
  segments: [
    { start: 0, end: 10, text: '안녕하세요. 오늘은 JavaScript의 변수 선언에 대해 배워보겠습니다.' },
    { start: 10, end: 20, text: 'JavaScript에서는 let, const, var 세 가지 키워드로 변수를 선언할 수 있습니다.' },
    { start: 20, end: 30, text: 'let은 블록 스코프를 가지며 재할당이 가능합니다.' },
    { start: 30, end: 40, text: 'const는 블록 스코프를 가지며 재할당이 불가능합니다.' },
    { start: 40, end: 50, text: 'var는 함수 스코프를 가지며 호이스팅됩니다.' },
    { start: 50, end: 60, text: '모던 JavaScript에서는 const를 우선적으로 사용하고, 재할당이 필요한 경우에만 let을 사용합니다.' }
  ],
  metadata: {
    language: 'ko',
    duration: 60,
    title: 'JavaScript 변수 선언'
  }
};

async function runDebugTest() {
  console.log('🐛 Starting Vectorize Debug Test');
  console.log('================================\n');

  const vectorIndex = new DebugVectorizeIndex();
  const openaiService = new MockOpenAIService();
  const vectorizeService = new VectorizeService(vectorIndex, openaiService);

  try {
    // Test 1: Check if services are properly initialized
    console.log('📋 Test 1: Service Initialization');
    console.log('✅ VectorizeService created');
    console.log('✅ Mock services ready\n');

    // Test 2: Test chunking
    console.log('📋 Test 2: Text Chunking');
    const chunks = vectorizeService.createSmartChunks(TEST_DATA.originalText);
    console.log(`Created ${chunks.length} chunks:`);
    chunks.forEach((chunk, i) => {
      console.log(`  Chunk ${i}: "${chunk}"`);
    });
    console.log('');

    // Test 3: Test embedding generation
    console.log('📋 Test 3: Embedding Generation');
    const testText = 'JavaScript 변수 선언';
    const embedding = await vectorizeService.generateEmbedding(testText);
    console.log(`✅ Generated embedding with ${embedding.length} dimensions`);
    console.log(`   Sample values: [${embedding.slice(0, 5).map(v => v.toFixed(6)).join(', ')}]`);
    console.log('');

    // Test 4: Content indexing
    console.log('📋 Test 4: Content Indexing');
    const indexResult = await vectorizeService.indexContent(
      TEST_DATA.contentId,
      TEST_DATA.originalText,
      TEST_DATA.summary,
      TEST_DATA.segments,
      TEST_DATA.metadata
    );

    console.log('Indexing result:', indexResult);

    const stats = vectorIndex.getStats();
    console.log('Vector index stats:', stats);

    const storedVectors = vectorIndex.getStoredVectors();
    console.log('\nStored vectors:');
    storedVectors.forEach(vector => {
      console.log(`  - ${vector.id}: ${vector.metadata.type} (${vector.values.length}D)`);
      console.log(`    Text: "${vector.metadata.text.substring(0, 60)}..."`);
    });
    console.log('');

    // Test 5: Search functionality
    console.log('📋 Test 5: Search Functionality');

    const searchQueries = [
      'JavaScript 변수',
      'let const var',
      '블록 스코프',
      '재할당',
      '호이스팅',
      '관련없는 내용'
    ];

    for (const query of searchQueries) {
      console.log(`\n🔍 Searching for: "${query}"`);

      try {
        const searchResult = await vectorizeService.searchContent(query, {
          topK: 3,
          includeMetadata: true
        });

        console.log(`   Results: ${searchResult.total}`);
        if (searchResult.results.length > 0) {
          searchResult.results.forEach((result, i) => {
            console.log(`   ${i + 1}. ${result.id} (score: ${result.score.toFixed(6)})`);
            console.log(`      "${result.text.substring(0, 60)}..."`);
          });
        } else {
          console.log('   No results found');
        }
      } catch (error) {
        console.error(`   ❌ Search failed: ${error.message}`);
      }
    }

    // Test 6: Context extraction
    console.log('\n📋 Test 6: Context Extraction');
    const contextQuery = 'JavaScript 변수 종류';
    console.log(`Getting context for: "${contextQuery}"`);

    const context = await vectorizeService.getContentContext(contextQuery, 3);
    console.log(`Has context: ${context.hasContext}`);
    console.log(`Sources: ${context.sources?.length || 0}`);
    if (context.hasContext) {
      console.log(`Context preview: "${context.context.substring(0, 200)}..."`);
    }

    // Test 7: Filtered search
    console.log('\n📋 Test 7: Filtered Search');

    // Search only transcripts
    const transcriptResults = await vectorizeService.searchContent('변수', {
      type: 'transcript',
      topK: 5
    });
    console.log(`Transcript-only results: ${transcriptResults.total}`);

    // Search only summary
    const summaryResults = await vectorizeService.searchContent('변수', {
      type: 'summary',
      topK: 5
    });
    console.log(`Summary-only results: ${summaryResults.total}`);

    // Final stats
    console.log('\n📊 Final Statistics:');
    const finalStats = vectorIndex.getStats();
    console.log(`  Total vectors: ${finalStats.totalVectors}`);
    console.log(`  Insert calls: ${finalStats.insertCalls}`);
    console.log(`  Query calls: ${finalStats.queryCalls}`);
    console.log(`  OpenAI calls: ${openaiService.callCount}`);

    console.log('\n✅ All debug tests completed successfully!');

  } catch (error) {
    console.error('\n❌ Debug test failed:', error);
    console.error('Stack trace:', error.stack);
    throw error;
  }
}

// Run the debug test
runDebugTest()
  .then(() => {
    console.log('\n🎉 Debug test suite completed!');
  })
  .catch((error) => {
    console.error('\n💥 Debug test suite failed:', error.message);
    process.exit(1);
  });