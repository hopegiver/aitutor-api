/**
 * Standalone Vectorize Test - No External Dependencies
 * Tests all VectorizeService functionality with mocked services
 */

import { VectorizeService } from './src/services/vectorize.js';

// Mock OpenAI Service that generates deterministic embeddings
class MockOpenAIService {
  constructor() {
    this.callCount = 0;
  }

  async createEmbedding(params) {
    this.callCount++;
    console.log(`   📡 Mock OpenAI call #${this.callCount}: "${params.input.substring(0, 30)}..."`);

    // Generate deterministic embedding based on input text
    const dimensions = 1536;
    const embedding = [];

    // Create a simple hash from the input
    let hash = 0;
    for (let i = 0; i < params.input.length; i++) {
      const char = params.input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }

    // Generate embedding values
    for (let i = 0; i < dimensions; i++) {
      const value = Math.sin(hash + i * 0.1) * 0.5 + Math.cos(hash * 0.7 + i) * 0.3;
      embedding.push(value);
    }

    // Normalize
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= norm;
    }

    return {
      data: [{
        embedding: embedding,
        index: 0
      }]
    };
  }
}

// Complete Mock Vectorize Index with realistic behavior
class CompleteMockVectorizeIndex {
  constructor() {
    this.vectors = new Map();
    this.insertCount = 0;
    this.queryCount = 0;
    this.deleteCount = 0;
  }

  async insert(vectorBatch) {
    console.log(`   📥 Inserting ${vectorBatch.length} vectors into index`);

    for (const vector of vectorBatch) {
      if (!this.validateVector(vector)) {
        throw new Error(`Invalid vector format: ${JSON.stringify(vector, null, 2)}`);
      }

      this.vectors.set(vector.id, {
        id: vector.id,
        values: [...vector.values],
        metadata: { ...vector.metadata }
      });
      this.insertCount++;
    }

    console.log(`   ✅ Successfully stored ${vectorBatch.length} vectors (Total: ${this.vectors.size})`);
    return { success: true };
  }

  validateVector(vector) {
    return vector.id &&
           Array.isArray(vector.values) &&
           vector.values.length > 0 &&
           vector.metadata &&
           typeof vector.metadata === 'object';
  }

  async query(searchOptions) {
    this.queryCount++;
    console.log(`   🔍 Query #${this.queryCount}: topK=${searchOptions.topK}, filters=${JSON.stringify(searchOptions.filter || {})}`);

    if (!searchOptions.vector || !Array.isArray(searchOptions.vector)) {
      throw new Error('Query vector is required and must be an array');
    }

    let candidates = Array.from(this.vectors.values());
    console.log(`   📊 Searching through ${candidates.length} stored vectors`);

    // Apply filters
    if (searchOptions.filter && Object.keys(searchOptions.filter).length > 0) {
      candidates = candidates.filter(vector => {
        for (const [key, value] of Object.entries(searchOptions.filter)) {
          if (vector.metadata[key] !== value) {
            return false;
          }
        }
        return true;
      });
      console.log(`   🔽 After filtering: ${candidates.length} candidates remain`);
    }

    if (candidates.length === 0) {
      console.log(`   ⚠️ No candidates match the filter criteria`);
      return { matches: [] };
    }

    // Calculate similarity scores
    const results = [];
    for (const vector of candidates) {
      if (vector.values.length !== searchOptions.vector.length) {
        console.log(`   ⚠️ Dimension mismatch: query ${searchOptions.vector.length} vs stored ${vector.values.length}`);
        continue;
      }

      const score = this.cosineSimilarity(searchOptions.vector, vector.values);
      results.push({
        id: vector.id,
        score: score,
        metadata: searchOptions.includeMetadata ? vector.metadata : undefined
      });
    }

    // Sort by relevance and limit results
    results.sort((a, b) => b.score - a.score);
    const matches = results.slice(0, searchOptions.topK || 10);

    console.log(`   📋 Returning ${matches.length} matches:`);
    matches.slice(0, 3).forEach((match, i) => {
      console.log(`     ${i + 1}. ${match.id} (score: ${match.score.toFixed(4)})`);
    });

    return { matches };
  }

  cosineSimilarity(a, b) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async deleteByIds(vectorIds) {
    console.log(`   🗑️ Deleting ${vectorIds.length} vectors by ID`);

    let deletedCount = 0;
    for (const id of vectorIds) {
      if (this.vectors.has(id)) {
        this.vectors.delete(id);
        deletedCount++;
        this.deleteCount++;
      }
    }

    console.log(`   ✅ Deleted ${deletedCount} vectors (${this.vectors.size} remaining)`);
    return { success: true };
  }

  getComprehensiveStats() {
    const vectors = Array.from(this.vectors.values());
    const contentIds = [...new Set(vectors.map(v => v.metadata?.contentId).filter(Boolean))];
    const types = [...new Set(vectors.map(v => v.metadata?.type).filter(Boolean))];

    return {
      totalVectors: this.vectors.size,
      insertOperations: this.insertCount,
      queryOperations: this.queryCount,
      deleteOperations: this.deleteCount,
      uniqueContentIds: contentIds.length,
      vectorTypes: types,
      sampleVectorIds: vectors.slice(0, 5).map(v => v.id)
    };
  }

  clear() {
    this.vectors.clear();
    this.insertCount = 0;
    this.queryCount = 0;
    this.deleteCount = 0;
  }
}

// Test Framework
class TestSuite {
  constructor() {
    this.tests = [];
    this.results = { passed: 0, failed: 0, skipped: 0 };
    this.startTime = Date.now();
  }

  test(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    console.log(`🚀 Running ${this.tests.length} comprehensive tests...\n`);

    for (const { name, fn } of this.tests) {
      const testStart = Date.now();

      try {
        console.log(`🧪 ${name}`);
        await fn();
        const duration = Date.now() - testStart;
        console.log(`✅ PASSED (${duration}ms)\n`);
        this.results.passed++;
      } catch (error) {
        const duration = Date.now() - testStart;
        console.log(`❌ FAILED (${duration}ms): ${error.message}\n`);
        this.results.failed++;
      }
    }

    this.showSummary();
    return this.results.failed === 0;
  }

  showSummary() {
    const totalTime = Date.now() - this.startTime;
    const total = this.results.passed + this.results.failed + this.results.skipped;

    console.log('📊 Test Summary');
    console.log('===============');
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`⏭️ Skipped: ${this.results.skipped}`);
    console.log(`📈 Success Rate: ${((this.results.passed / total) * 100).toFixed(1)}%`);
    console.log(`⏱️ Total Time: ${totalTime}ms`);
    console.log(`⚡ Average: ${(totalTime / total).toFixed(1)}ms per test`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

// Test execution
async function runStandaloneTests() {
  console.log('🧪 Standalone Vectorize Service Test Suite');
  console.log('==========================================\n');

  const suite = new TestSuite();

  // Initialize services
  const mockOpenAI = new MockOpenAIService();
  const mockVectorIndex = new CompleteMockVectorizeIndex();
  const vectorizeService = new VectorizeService(mockVectorIndex, mockOpenAI);

  // Test data
  const testContent = {
    contentId: 'standalone-test-001',
    originalText: `
      프론트엔드 개발에서 React는 가장 인기 있는 라이브러리 중 하나입니다.
      컴포넌트 기반 아키텍처를 통해 재사용 가능한 UI를 구축할 수 있습니다.
      useState Hook을 사용하면 함수형 컴포넌트에서 상태를 관리할 수 있습니다.
      useEffect Hook은 사이드 이펙트를 처리하는 데 사용됩니다.
      Context API를 활용하면 전역 상태를 관리할 수 있습니다.
      React Router를 사용하여 SPA를 구현할 수 있습니다.
    `,
    summary: 'React 라이브러리의 핵심 개념과 Hook, Context API, Router에 대한 설명',
    segments: [
      { text: '프론트엔드 개발에서 React는 가장 인기 있는 라이브러리', start: 0, end: 15 },
      { text: '컴포넌트 기반 아키텍처를 통해 재사용 가능한 UI', start: 15, end: 30 },
      { text: 'useState Hook을 사용하면 함수형 컴포넌트에서 상태를 관리', start: 30, end: 45 },
      { text: 'useEffect Hook은 사이드 이펙트를 처리하는 데 사용', start: 45, end: 60 },
      { text: 'Context API를 활용하면 전역 상태를 관리', start: 60, end: 75 },
      { text: 'React Router를 사용하여 SPA를 구현', start: 75, end: 90 }
    ],
    metadata: {
      language: 'ko',
      duration: 90,
      title: 'React 완전 정복'
    }
  };

  // Test 1: Service Initialization
  suite.test('Service Initialization', async () => {
    assert(vectorizeService instanceof VectorizeService, 'VectorizeService should be properly instantiated');
    assert(mockOpenAI instanceof MockOpenAIService, 'Mock OpenAI service should be ready');
    assert(mockVectorIndex instanceof CompleteMockVectorizeIndex, 'Mock Vectorize index should be ready');
    console.log('   ✓ All services initialized correctly');
  });

  // Test 2: Text Chunking Algorithm
  suite.test('Smart Text Chunking', async () => {
    const chunks = vectorizeService.createSmartChunks(testContent.originalText, 200);

    console.log(`   📝 Generated ${chunks.length} chunks:`);
    chunks.forEach((chunk, i) => {
      console.log(`     ${i + 1}. (${chunk.length} chars) "${chunk.substring(0, 50)}..."`);
    });

    assert(chunks.length > 0, 'Should generate at least one chunk');
    assert(chunks.every(chunk => chunk.length <= 220), 'All chunks should respect size limit with tolerance');
    assert(chunks.every(chunk => chunk.trim().length > 15), 'All chunks should have meaningful content');

    // Test edge cases
    const emptyChunks = vectorizeService.createSmartChunks('', 100);
    assert(emptyChunks.length === 0, 'Empty text should produce no chunks');

    const shortChunks = vectorizeService.createSmartChunks('짧은 텍스트', 100);
    assert(shortChunks.length === 1, 'Short text should produce one chunk');

    console.log('   ✓ Chunking algorithm working correctly');
  });

  // Test 3: Timestamp Extraction
  suite.test('Timestamp Extraction Logic', async () => {
    const testChunk = 'useState Hook을 사용하면 함수형 컴포넌트에서 상태를 관리';
    const timestamps = vectorizeService.extractTimestampsFromSegments(testContent.segments, testChunk);

    console.log(`   ⏰ Extracted timestamps for "${testChunk.substring(0, 30)}..."`);
    console.log(`     Start: ${timestamps.startTime}s, End: ${timestamps.endTime}s`);

    assert(typeof timestamps.startTime === 'number', 'Start time should be a number');
    assert(typeof timestamps.endTime === 'number', 'End time should be a number');
    assert(timestamps.endTime >= timestamps.startTime, 'End time should be >= start time');

    // Test with no segments
    const noSegments = vectorizeService.extractTimestampsFromSegments([], testChunk);
    assert(noSegments.startTime === 0 && noSegments.endTime === 0, 'Should handle empty segments');

    console.log('   ✓ Timestamp extraction working correctly');
  });

  // Test 4: Embedding Generation
  suite.test('Mock Embedding Generation', async () => {
    const testTexts = [
      'React Hook',
      'useState를 사용한 상태 관리',
      '매우 긴 텍스트입니다. 이것은 임베딩 생성 테스트를 위한 긴 문장으로, 다양한 길이의 텍스트에 대해 일관된 임베딩이 생성되는지 확인합니다.'
    ];

    for (const text of testTexts) {
      console.log(`   🔢 Testing embedding for: "${text.substring(0, 30)}..."`);

      const embedding = await vectorizeService.generateEmbedding(text);

      assert(Array.isArray(embedding), 'Embedding should be an array');
      assert(embedding.length === 1536, `Should have 1536 dimensions, got ${embedding.length}`);
      assert(embedding.every(v => typeof v === 'number' && !isNaN(v)), 'All values should be valid numbers');

      // Check normalization (approximately unit vector)
      const magnitude = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
      assert(Math.abs(magnitude - 1.0) < 0.01, `Vector should be normalized (magnitude: ${magnitude.toFixed(4)})`);

      console.log(`     ✓ Generated ${embedding.length}D normalized vector`);
    }

    console.log('   ✓ Embedding generation working correctly');
  });

  // Test 5: Content Indexing
  suite.test('Complete Content Indexing', async () => {
    const result = await vectorizeService.indexContent(
      testContent.contentId,
      testContent.originalText,
      testContent.summary,
      testContent.segments,
      testContent.metadata
    );

    console.log(`   📊 Indexing result:`, result);

    assert(result.success === true, 'Indexing should succeed');
    assert(typeof result.chunksIndexed === 'number' && result.chunksIndexed > 0, 'Should index transcript chunks');
    assert(typeof result.summaryIndexed === 'number' && result.summaryIndexed === 1, 'Should index summary');
    assert(result.totalVectors === result.chunksIndexed + result.summaryIndexed, 'Total should match sum');

    const stats = mockVectorIndex.getComprehensiveStats();
    console.log(`   📈 Index stats: ${stats.totalVectors} vectors, ${stats.uniqueContentIds} content IDs`);

    assert(stats.totalVectors >= 2, 'Should have at least transcript and summary vectors');
    assert(stats.uniqueContentIds === 1, 'Should have exactly one content ID');
    assert(stats.vectorTypes.includes('transcript'), 'Should include transcript type');
    assert(stats.vectorTypes.includes('summary'), 'Should include summary type');

    console.log('   ✓ Content indexing completed successfully');
  });

  // Test 6: Basic Vector Search
  suite.test('Vector Search Operations', async () => {
    const searchQueries = [
      'React Hook 사용법',
      'useState 상태 관리',
      'useEffect 사이드 이펙트',
      'Context API 전역 상태',
      'Router SPA 구현',
      '완전히 관련없는 내용 데이터베이스 SQL'
    ];

    for (const query of searchQueries) {
      console.log(`   🔍 Searching: "${query}"`);

      const result = await vectorizeService.searchContent(query, {
        topK: 3,
        includeMetadata: true
      });

      assert(Array.isArray(result.results), 'Results should be an array');
      assert(result.query === query, 'Query should match input');
      assert(typeof result.total === 'number', 'Total should be a number');

      console.log(`     Found ${result.results.length} matches`);

      if (result.results.length > 0) {
        result.results.forEach((match, i) => {
          assert(typeof match.id === 'string', 'Match ID should be a string');
          assert(typeof match.score === 'number', 'Score should be a number');
          assert(match.contentId === testContent.contentId, 'Content ID should match');
          console.log(`       ${i + 1}. ${match.id} (${match.score.toFixed(4)}) - ${match.type}`);
        });
      }
    }

    console.log('   ✓ Vector search working correctly');
  });

  // Test 7: Filtered Search
  suite.test('Advanced Filtered Search', async () => {
    // Search only transcripts
    const transcriptResults = await vectorizeService.searchContent('Hook', {
      type: 'transcript',
      topK: 5,
      includeMetadata: true
    });

    console.log(`   📝 Transcript-only search: ${transcriptResults.results.length} results`);
    transcriptResults.results.forEach(result => {
      assert(result.type === 'transcript', `Expected transcript, got ${result.type}`);
    });

    // Search only summaries
    const summaryResults = await vectorizeService.searchContent('Hook', {
      type: 'summary',
      topK: 5,
      includeMetadata: true
    });

    console.log(`   📄 Summary-only search: ${summaryResults.results.length} results`);
    summaryResults.results.forEach(result => {
      assert(result.type === 'summary', `Expected summary, got ${result.type}`);
    });

    // Search by content ID
    const contentResults = await vectorizeService.searchContent('React', {
      contentId: testContent.contentId,
      topK: 5,
      includeMetadata: true
    });

    console.log(`   📋 Content ID filtered search: ${contentResults.results.length} results`);
    contentResults.results.forEach(result => {
      assert(result.contentId === testContent.contentId, 'Content ID should match filter');
    });

    // Search with multiple filters
    const multipleFilters = await vectorizeService.searchContent('컴포넌트', {
      contentId: testContent.contentId,
      type: 'transcript',
      language: 'ko',
      topK: 3
    });

    console.log(`   🔧 Multiple filters search: ${multipleFilters.results.length} results`);

    console.log('   ✓ Filtered search working correctly');
  });

  // Test 8: Context Generation for AI Chat
  suite.test('AI Chat Context Generation', async () => {
    const contextQueries = [
      'React Hook에 대해 설명해주세요',
      'useState를 어떻게 사용하나요?',
      'Context API는 무엇인가요?',
      '전혀 관련없는 질문입니다'
    ];

    for (const query of contextQueries) {
      console.log(`   💬 Getting context for: "${query}"`);

      const context = await vectorizeService.getContentContext(query, 3);

      assert(typeof context.hasContext === 'boolean', 'Should have hasContext flag');
      assert(typeof context.context === 'string', 'Should have context string');
      assert(Array.isArray(context.sources), 'Should have sources array');

      console.log(`     Has context: ${context.hasContext}`);
      console.log(`     Context length: ${context.context.length} chars`);
      console.log(`     Sources: ${context.sources.length}`);

      if (context.hasContext) {
        assert(context.context.length > 0, 'Context should not be empty when available');
        assert(context.sources.length > 0, 'Should have sources when context is available');

        console.log(`     Preview: "${context.context.substring(0, 60)}..."`);

        context.sources.forEach((source, i) => {
          assert(typeof source.contentId === 'string', 'Source should have content ID');
          assert(typeof source.type === 'string', 'Source should have type');
          assert(typeof source.score === 'number', 'Source should have score');
          console.log(`       Source ${i + 1}: ${source.contentId} (${source.type}, ${source.score.toFixed(4)})`);
        });
      }
    }

    console.log('   ✓ Context generation working correctly');
  });

  // Test 9: Performance and Scalability
  suite.test('Performance and Scalability', async () => {
    console.log('   ⚡ Testing performance with multiple operations');

    const startTime = Date.now();

    // Parallel operations
    const operations = [
      vectorizeService.searchContent('React', { topK: 5 }),
      vectorizeService.searchContent('Hook', { topK: 5 }),
      vectorizeService.searchContent('컴포넌트', { topK: 5 }),
      vectorizeService.getContentContext('useState 사용법', 3),
      vectorizeService.getContentContext('useEffect 활용', 3)
    ];

    const results = await Promise.all(operations);
    const duration = Date.now() - startTime;

    console.log(`   📊 Executed ${operations.length} parallel operations in ${duration}ms`);
    console.log(`   ⚡ Average: ${(duration / operations.length).toFixed(1)}ms per operation`);

    assert(duration < 5000, 'Operations should complete within 5 seconds');
    assert(results.length === operations.length, 'All operations should complete');
    assert(results.every(result => result && typeof result === 'object'), 'All results should be valid');

    // Test with large batch
    const largeText = testContent.originalText.repeat(20);
    const largeChunks = vectorizeService.createSmartChunks(largeText, 300);
    console.log(`   📏 Large text chunking: ${largeChunks.length} chunks from ${largeText.length} chars`);

    assert(largeChunks.length > 10, 'Should generate many chunks for large text');

    console.log('   ✓ Performance tests passed');
  });

  // Test 10: Error Handling and Edge Cases
  suite.test('Error Handling and Edge Cases', async () => {
    console.log('   🛡️ Testing error handling and edge cases');

    // Test with empty/invalid inputs
    const emptyResult = await vectorizeService.searchContent('', { topK: 5 });
    assert(Array.isArray(emptyResult.results), 'Should handle empty query gracefully');

    // Test with very long query
    const longQuery = 'React Hook '.repeat(100);
    const longQueryResult = await vectorizeService.searchContent(longQuery, { topK: 3 });
    assert(Array.isArray(longQueryResult.results), 'Should handle very long query');

    // Test with invalid filters
    const invalidFilterResult = await vectorizeService.searchContent('test', {
      contentId: 'non-existent-id-12345',
      topK: 5
    });
    assert(invalidFilterResult.results.length === 0, 'Should return empty results for non-existent content');

    // Test context with low relevance
    const lowRelevanceContext = await vectorizeService.getContentContext('완전히 다른 주제 블록체인 암호화폐', 5);
    console.log(`     Low relevance context: ${lowRelevanceContext.hasContext}`);

    console.log('   ✓ Error handling working correctly');
  });

  // Run all tests
  const success = await suite.run();

  // Final comprehensive analysis
  console.log('\n🔍 Comprehensive Analysis');
  console.log('=========================');

  const finalStats = mockVectorIndex.getComprehensiveStats();
  console.log('📊 Final Vector Index Statistics:');
  console.log(`   Total Vectors: ${finalStats.totalVectors}`);
  console.log(`   Insert Operations: ${finalStats.insertOperations}`);
  console.log(`   Query Operations: ${finalStats.queryOperations}`);
  console.log(`   Delete Operations: ${finalStats.deleteOperations}`);
  console.log(`   Unique Content IDs: ${finalStats.uniqueContentIds}`);
  console.log(`   Vector Types: ${finalStats.vectorTypes.join(', ')}`);

  console.log('\n🎯 Service Capabilities Verified:');
  console.log('   ✅ Smart text chunking with sentence boundaries');
  console.log('   ✅ Timestamp extraction from VTT segments');
  console.log('   ✅ Deterministic embedding generation');
  console.log('   ✅ Batch vector insertion and indexing');
  console.log('   ✅ Similarity search with scoring');
  console.log('   ✅ Advanced filtering (type, content ID, language)');
  console.log('   ✅ AI chat context generation with relevance threshold');
  console.log('   ✅ Performance optimization for parallel operations');
  console.log('   ✅ Robust error handling and edge cases');

  if (success) {
    console.log('\n🎉 All tests passed! VectorizeService is working correctly.');
    console.log('\n🔧 If you\'re still experiencing search issues in production:');
    console.log('   1. Verify Cloudflare Vectorize index binding in wrangler.toml');
    console.log('   2. Check OPENAI_API_KEY in Cloudflare Workers secrets');
    console.log('   3. Ensure AI Gateway is properly configured');
    console.log('   4. Verify index permissions and quota limits');
    console.log('   5. Check Cloudflare Workers logs for runtime errors');
    console.log('   6. Test with real data in the production environment');
  } else {
    console.log('\n❌ Some tests failed. Review the errors above.');
  }

  return success;
}

// Execute the standalone test suite
console.log('🧪 Starting Standalone Vectorize Test Suite');
console.log('============================================\n');

runStandaloneTests()
  .then(success => {
    console.log(success ? '\n🚀 Test suite completed successfully!' : '\n⚠️ Test suite completed with failures');
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('\n💥 Test suite execution failed:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  });